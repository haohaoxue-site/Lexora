import type {
  LexoraConfig,
  LexoraConfigPatch,
  LexoraDesktopApi,
} from '../../electron/shared/desktopApi'
import type {
  LocalBuddyServiceSupervisorState,
  LocalConnector,
  LocalConnectorConfig,
  LocalConnectorCredential,
  LocalConnectorCredentialMutation,
  LocalCustomProvider,
  LocalDefaultModel,
  LocalProvider,
  LocalProviderAuthChallenge,
  LocalRuntimeDataBackup,
  LocalRuntimeDataBackupStorage,
  LocalRuntimeDataOperation,
  LocalRuntimeDataRecoveryReceipt,
  LocalRuntimeDataRestore,
  LocalRuntimeModelOption,
  LocalSkillCatalog,
  LocalUsageSnapshot,
} from '../../electron/shared/localChatApi'
import type {
  BuddyServiceTier,
  BuddyThinkingLevel,
} from '../../shared/modelSelection'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { computed, shallowRef } from 'vue'
import { resolveBuddyLocale, translateBuddy } from '@/i18n/buddyI18n'
import { isProviderLoginCancelled, normalizeDesktopError } from './desktopChatError'

interface UseDesktopRuntimeOptions {
  api: LexoraDesktopApi
  onCatalogChanged?: () => void
  onReady: () => void
}

const EMPTY_SKILL_CATALOG: LocalSkillCatalog = { diagnostics: [], skills: [] }
const RUNTIME_FAILURE_MESSAGE_KEYS = {
  EVENT_LOG_CORRUPTED: 'runtime.failure.EVENT_LOG_CORRUPTED',
  EVENT_PROJECTION_FAILED: 'runtime.failure.EVENT_PROJECTION_FAILED',
  EVENT_STORAGE_FAILED: 'runtime.failure.EVENT_STORAGE_FAILED',
  RUNTIME_PROTOCOL_FAILED: 'runtime.failure.RUNTIME_PROTOCOL_FAILED',
  RUNTIME_PROTOCOL_INCOMPATIBLE: 'runtime.failure.RUNTIME_PROTOCOL_INCOMPATIBLE',
  RUNTIME_READINESS_TIMEOUT: 'runtime.failure.RUNTIME_READINESS_TIMEOUT',
  RUNTIME_SPAWN_FAILED: 'runtime.failure.RUNTIME_SPAWN_FAILED',
  RUNTIME_START_FAILED: 'runtime.failure.RUNTIME_START_FAILED',
  RUNTIME_STOPPED: 'runtime.failure.RUNTIME_STOPPED',
  RUNTIME_TERMINATION_FAILED: 'runtime.failure.RUNTIME_TERMINATION_FAILED',
} as const

export function useDesktopRuntime(options: UseDesktopRuntimeOptions) {
  const runtimeState = shallowRef<LocalBuddyServiceSupervisorState>({
    lastError: null,
    pid: null,
    restartAttempt: 0,
    status: 'stopped',
  })
  const providers = shallowRef<ReadonlyArray<LocalProvider>>([])
  const registeredModels = shallowRef<ReadonlyArray<LocalRuntimeModelOption>>([])
  const skills = shallowRef<LocalSkillCatalog>(EMPTY_SKILL_CATALOG)
  const connectors = shallowRef<ReadonlyArray<LocalConnector>>([])
  const usageSnapshot = shallowRef<LocalUsageSnapshot | null>(null)
  const authChallenge = shallowRef<LocalProviderAuthChallenge | null>(null)
  const config = shallowRef<LexoraConfig | null>(null)
  const language = shallowRef<BuddyLocale>('zh-CN')
  const defaultModelSelection = shallowRef<LocalDefaultModel | null>(null)
  const selectedModelId = shallowRef<string | null>(null)
  const selectedEffort = shallowRef<BuddyThinkingLevel | null>(null)
  const selectedServiceTier = shallowRef<BuddyServiceTier | null>(null)
  const isLoadingAgent = shallowRef(false)
  const isLoadingUsage = shallowRef(false)
  const isLoadingSkills = shallowRef(false)
  const isLoadingConnectors = shallowRef(false)
  const isAuthenticating = shallowRef(false)
  const mutatingProviderId = shallowRef<string | null>(null)
  const syncingProviderId = shallowRef<string | null>(null)
  const agentError = shallowRef<string | null>(null)
  const usageError = shallowRef<string | null>(null)
  const skillsError = shallowRef<string | null>(null)
  const connectorsError = shallowRef<string | null>(null)
  const settingsError = shallowRef<string | null>(null)
  const runtimeRecoveryError = shallowRef<string | null>(null)
  const runtimeDataBackups = shallowRef<ReadonlyArray<LocalRuntimeDataBackup>>([])
  const runtimeDataBackupStorage = shallowRef<LocalRuntimeDataBackupStorage | null>(null)
  const runtimeDataOperation = shallowRef<LocalRuntimeDataOperation | null>(null)
  const runtimeDataRecoveryReceipt = shallowRef<LocalRuntimeDataRecoveryReceipt | null>(null)
  const startingRuntimeDataOperation = shallowRef<{
    backupId: string | null
    kind: LocalRuntimeDataOperation['kind']
  } | null>(null)
  const latestRuntimeRestore = shallowRef<LocalRuntimeDataRestore | null>(null)
  const latestRuntimeBackupPath = shallowRef<string | null>(null)
  const isLoadingRuntimeBackups = shallowRef(false)
  const isOpeningRuntimeDataDirectory = shallowRef(false)
  const deletingRuntimeBackupId = shallowRef<string | null>(null)
  const validatingRuntimeBackupId = shallowRef<string | null>(null)
  let initialized = false
  let runtimeStateGeneration = 0
  let runtimeDataOperationGeneration = 0
  let loadedSkillsProjectId: string | null | undefined
  let skillLoadGeneration = 0

  const models = computed(() => filterAvailableModels(providers.value, registeredModels.value))
  const defaultModelId = computed(() => defaultModelSelection.value
    ? modelKey(defaultModelSelection.value)
    : null)
  const defaultEffort = computed(() => defaultModelSelection.value?.reasoning ?? null)
  const runtimeError = computed(() => {
    const code = runtimeState.value.lastError
    return code ? translateBuddy(language.value, RUNTIME_FAILURE_MESSAGE_KEYS[code]) : null
  })
  const isRuntimeDataOperationActive = computed(() => (
    startingRuntimeDataOperation.value !== null
    || runtimeDataOperation.value?.status === 'running'
    || runtimeDataOperation.value?.status === 'cancelling'
  ))
  const isCreatingRuntimeBackup = computed(() => (
    startingRuntimeDataOperation.value?.kind === 'backup'
    || (
      runtimeDataOperation.value?.kind === 'backup'
      && ['running', 'cancelling'].includes(runtimeDataOperation.value.status)
    )
  ))
  const restoringRuntimeBackupId = computed(() => {
    if (startingRuntimeDataOperation.value?.kind === 'restore')
      return startingRuntimeDataOperation.value.backupId
    const operation = runtimeDataOperation.value
    return operation?.kind === 'restore'
      && ['running', 'cancelling'].includes(operation.status)
      ? operation.backupId
      : null
  })
  const canCancelRuntimeDataOperation = computed(() => (
    runtimeDataOperation.value?.status === 'running'
    && runtimeDataOperation.value.cancellable
  ))
  const canRestartRuntime = computed(() => (
    runtimeState.value.status === 'offline'
    && runtimeState.value.pid === null
    && !isRuntimeDataOperationActive.value
    && deletingRuntimeBackupId.value === null
    && validatingRuntimeBackupId.value === null
  ))
  const canCreateRuntimeBackup = computed(() => (
    runtimeState.value.status === 'offline'
    && runtimeState.value.pid === null
    && runtimeDataBackupStorage.value?.canCreateBackup !== false
    && !isRuntimeDataOperationActive.value
    && deletingRuntimeBackupId.value === null
    && validatingRuntimeBackupId.value === null
  ))
  const canOpenRuntimeDataDirectory = computed(() => (
    runtimeState.value.status === 'offline'
    && !isRuntimeDataOperationActive.value
    && deletingRuntimeBackupId.value === null
  ))
  const selectedModel = computed(() => models.value.find(
    model => modelKey(model) === selectedModelId.value,
  ) ?? null)
  const stopRuntimeState = options.api.localChat.runtime.onStateChanged((state) => {
    const wasReady = runtimeState.value.status === 'ready'
    const wasOffline = runtimeState.value.status === 'offline'
    runtimeStateGeneration += 1
    runtimeState.value = state
    if (state.status !== 'offline') {
      runtimeRecoveryError.value = null
      runtimeDataBackups.value = []
      runtimeDataBackupStorage.value = null
      latestRuntimeRestore.value = null
      latestRuntimeBackupPath.value = null
    }
    else if (initialized && !wasOffline && state.pid === null) {
      void loadRuntimeDataBackups()
    }
    if (initialized && !wasReady && state.status === 'ready')
      options.onReady()
  })
  const stopRuntimeDataOperation = options.api.localChat.runtime.onDataOperationChanged(
    (operation) => {
      runtimeDataOperationGeneration += 1
      applyRuntimeDataOperation(operation)
    },
  )
  const stopAuthChallenge = options.api.localChat.providers.onAuthChallenge((challenge) => {
    authChallenge.value = challenge
  })

  async function initialize(): Promise<boolean> {
    const statusGeneration = runtimeStateGeneration
    const dataOperationGeneration = runtimeDataOperationGeneration
    const results = await Promise.allSettled([
      options.api.settings.get(),
      options.api.localChat.runtime.getStatus(),
      loadAgent(true),
      options.api.localChat.runtime.getDataOperation(),
      options.api.localChat.runtime.getDataRecoveryReceipt(),
    ])
    const settingsResult = results[0]
    const runtimeResult = results[1]
    const dataOperationResult = results[3]
    const recoveryReceiptResult = results[4]
    if (settingsResult.status === 'fulfilled')
      applyConfig(settingsResult.value)
    if (
      runtimeResult.status === 'fulfilled'
      && statusGeneration === runtimeStateGeneration
    ) {
      runtimeState.value = runtimeResult.value
    }
    if (
      dataOperationResult.status === 'fulfilled'
      && dataOperationGeneration === runtimeDataOperationGeneration
      && dataOperationResult.value
    ) {
      applyRuntimeDataOperation(dataOperationResult.value)
    }
    if (recoveryReceiptResult.status === 'fulfilled')
      runtimeDataRecoveryReceipt.value = recoveryReceiptResult.value
    initialized = true
    if (runtimeState.value.status === 'offline' && runtimeState.value.pid === null)
      await loadRuntimeDataBackups()
    return results.every(result => result.status === 'fulfilled')
  }

  async function loadAgent(force = false): Promise<boolean> {
    if (isLoadingAgent.value)
      return false
    if (!force && providers.value.length && registeredModels.value.length)
      return true
    isLoadingAgent.value = true
    agentError.value = null
    try {
      const [nextProviders, nextModels, nextDefaultModel] = await Promise.all([
        options.api.localChat.providers.list(),
        options.api.localChat.providers.listModels(),
        options.api.localChat.providers.getDefaultModel(),
      ])
      providers.value = nextProviders
      registeredModels.value = nextModels
      defaultModelSelection.value = nextDefaultModel
      reconcileModelSelection()
      options.onCatalogChanged?.()
      return true
    }
    catch (error) {
      agentError.value = normalizeDesktopError(error, language.value)
      return false
    }
    finally {
      isLoadingAgent.value = false
    }
  }

  async function loadUsage(): Promise<boolean> {
    isLoadingUsage.value = true
    usageError.value = null
    try {
      usageSnapshot.value = await options.api.localChat.usage.getSnapshot()
      return true
    }
    catch (error) {
      usageError.value = normalizeDesktopError(error, language.value)
      return false
    }
    finally {
      isLoadingUsage.value = false
    }
  }

  async function loadSkills(nextProjectId: string | null = null): Promise<boolean> {
    if (loadedSkillsProjectId !== undefined && loadedSkillsProjectId === nextProjectId)
      return true
    const generation = ++skillLoadGeneration
    isLoadingSkills.value = true
    skillsError.value = null
    try {
      const catalog = await options.api.localChat.skills.list(nextProjectId)
      if (generation !== skillLoadGeneration)
        return false
      skills.value = catalog
      loadedSkillsProjectId = nextProjectId
      return true
    }
    catch (error) {
      skillsError.value = normalizeDesktopError(error, language.value)
      return false
    }
    finally {
      if (generation === skillLoadGeneration)
        isLoadingSkills.value = false
    }
  }

  async function loadConnectors(): Promise<boolean> {
    isLoadingConnectors.value = true
    connectorsError.value = null
    try {
      connectors.value = await options.api.localChat.connectors.list()
      return true
    }
    catch (error) {
      connectorsError.value = normalizeDesktopError(error, language.value)
      return false
    }
    finally {
      isLoadingConnectors.value = false
    }
  }

  async function loginProvider(providerId: string, authType: 'api_key' | 'oauth') {
    if (isAuthenticating.value)
      return false
    isAuthenticating.value = true
    agentError.value = null
    try {
      await options.api.localChat.providers.login(providerId, authType)
      if (authChallenge.value?.providerId === providerId)
        authChallenge.value = null
      await loadAgent(true)
      return true
    }
    catch (error) {
      if (!isProviderLoginCancelled(error))
        agentError.value = normalizeDesktopError(error, language.value)
      return false
    }
    finally {
      isAuthenticating.value = false
    }
  }

  async function respondToAuth(challengeId: string, value: string) {
    try {
      await options.api.localChat.providers.respondToAuth(challengeId, value)
      if (authChallenge.value?.challengeId === challengeId)
        authChallenge.value = null
      await loadAgent(true)
      return true
    }
    catch (error) {
      agentError.value = normalizeDesktopError(error, language.value)
      return false
    }
  }

  async function cancelAuth(challengeId: string) {
    await options.api.localChat.providers.cancelAuth(challengeId).catch(() => {})
    if (authChallenge.value?.challengeId === challengeId)
      authChallenge.value = null
  }

  async function logoutProvider(providerId: string) {
    try {
      await options.api.localChat.providers.logout(providerId)
      await loadAgent(true)
      return true
    }
    catch (error) {
      agentError.value = normalizeDesktopError(error, language.value)
      return false
    }
  }

  async function upsertCustomProvider(provider: LocalCustomProvider) {
    try {
      await options.api.localChat.providers.upsertCustom(provider)
      await loadAgent(true)
      return true
    }
    catch (error) {
      agentError.value = normalizeDesktopError(error, language.value)
      return false
    }
  }

  async function addProvider(providerId: string) {
    return mutateProvider(providerId, () => options.api.localChat.providers.add(providerId))
  }

  async function clearProviderCredential(providerId: string) {
    return mutateProvider(providerId, () => options.api.localChat.providers.clearCredential(providerId))
  }

  async function removeProvider(providerId: string) {
    return mutateProvider(providerId, () => options.api.localChat.providers.remove(providerId))
  }

  async function setProviderEnabled(providerId: string, enabled: boolean) {
    return mutateProvider(
      providerId,
      () => options.api.localChat.providers.setEnabled(providerId, enabled),
    )
  }

  async function setProviderModelEnabled(providerId: string, modelId: string, enabled: boolean) {
    return mutateProvider(
      providerId,
      () => options.api.localChat.providers.setModelEnabled(providerId, modelId, enabled),
    )
  }

  async function setModelParameters(
    providerId: string,
    modelId: string,
    parameters: { contextWindow: number, maxTokens: number },
  ) {
    return mutateProvider(
      providerId,
      () => options.api.localChat.providers.setModelParameters(providerId, modelId, parameters),
    )
  }

  async function acknowledgeModelSourceUpdate(providerId: string, modelId: string) {
    return mutateProvider(
      providerId,
      () => options.api.localChat.providers.acknowledgeModelSourceUpdate(providerId, modelId),
    )
  }

  async function restoreModelSourceParameters(providerId: string, modelId: string) {
    return mutateProvider(
      providerId,
      () => options.api.localChat.providers.restoreModelSourceParameters(providerId, modelId),
    )
  }

  async function upsertManualModel(
    providerId: string,
    model: Parameters<LexoraDesktopApi['localChat']['providers']['upsertManualModel']>[1],
  ) {
    return mutateProvider(
      providerId,
      () => options.api.localChat.providers.upsertManualModel(providerId, model),
    )
  }

  async function syncProviderModels(providerId: string) {
    if (syncingProviderId.value)
      return false
    syncingProviderId.value = providerId
    agentError.value = null
    try {
      await options.api.localChat.providers.syncModels(providerId)
      await loadAgent(true)
      return true
    }
    catch (error) {
      agentError.value = normalizeDesktopError(error, language.value)
      return false
    }
    finally {
      syncingProviderId.value = null
    }
  }

  async function mutateProvider(providerId: string, operation: () => Promise<unknown>) {
    if (mutatingProviderId.value)
      return false
    mutatingProviderId.value = providerId
    agentError.value = null
    try {
      await operation()
      await loadAgent(true)
      return true
    }
    catch (error) {
      agentError.value = normalizeDesktopError(error, language.value)
      return false
    }
    finally {
      mutatingProviderId.value = null
    }
  }

  function clearAgentError() {
    agentError.value = null
  }

  async function saveConnector(input: {
    config: LocalConnectorConfig
    credential: LocalConnectorCredentialMutation
  }) {
    try {
      connectors.value = await options.api.localChat.connectors.upsert(input)
      return true
    }
    catch (error) {
      connectorsError.value = normalizeDesktopError(error, language.value)
      return false
    }
  }

  async function removeConnector(connectorId: string) {
    try {
      await options.api.localChat.connectors.remove(connectorId)
      await loadConnectors()
      return true
    }
    catch (error) {
      connectorsError.value = normalizeDesktopError(error, language.value)
      return false
    }
  }

  async function trustConnector(connectorId: string) {
    try {
      await options.api.localChat.connectors.trust(connectorId)
      await loadConnectors()
      return true
    }
    catch (error) {
      connectorsError.value = normalizeDesktopError(error, language.value)
      return false
    }
  }

  async function setConnectorCredential(
    connectorId: string,
    credential: LocalConnectorCredential,
  ) {
    try {
      await options.api.localChat.connectors.setCredential(connectorId, credential)
      await loadConnectors()
      return true
    }
    catch (error) {
      connectorsError.value = normalizeDesktopError(error, language.value)
      return false
    }
  }

  async function clearConnectorCredential(connectorId: string) {
    try {
      await options.api.localChat.connectors.clearCredential(connectorId)
      await loadConnectors()
      return true
    }
    catch (error) {
      connectorsError.value = normalizeDesktopError(error, language.value)
      return false
    }
  }

  async function restartRuntime() {
    agentError.value = null
    try {
      runtimeState.value = await options.api.localChat.runtime.restart()
      return true
    }
    catch (error) {
      agentError.value = normalizeDesktopError(error, language.value)
      return false
    }
  }

  async function createRuntimeDataBackup() {
    if (!canCreateRuntimeBackup.value || isCreatingRuntimeBackup.value)
      return false
    startingRuntimeDataOperation.value = { backupId: null, kind: 'backup' }
    runtimeRecoveryError.value = null
    latestRuntimeBackupPath.value = null
    latestRuntimeRestore.value = null
    const generation = runtimeDataOperationGeneration
    try {
      const operation = await options.api.localChat.runtime.startDataBackup()
      if (generation === runtimeDataOperationGeneration)
        applyRuntimeDataOperation(operation)
      return true
    }
    catch {
      runtimeRecoveryError.value = translateBuddy(
        language.value,
        'desktop.agent.runtimeBackupFailed',
      )
      return false
    }
    finally {
      startingRuntimeDataOperation.value = null
    }
  }

  async function loadRuntimeDataBackups() {
    if (
      runtimeState.value.status !== 'offline'
      || runtimeState.value.pid !== null
      || isLoadingRuntimeBackups.value
    ) {
      return false
    }
    isLoadingRuntimeBackups.value = true
    runtimeRecoveryError.value = null
    try {
      const [backups, storage] = await Promise.all([
        options.api.localChat.runtime.listDataBackups(),
        options.api.localChat.runtime.getDataBackupStorage(),
      ])
      runtimeDataBackups.value = backups
      runtimeDataBackupStorage.value = storage
      return true
    }
    catch {
      runtimeRecoveryError.value = translateBuddy(
        language.value,
        'desktop.agent.runtimeBackupListFailed',
      )
      return false
    }
    finally {
      isLoadingRuntimeBackups.value = false
    }
  }

  async function validateRuntimeDataBackup(backupId: string) {
    const backup = runtimeDataBackups.value.find(item => item.id === backupId)
    if (
      runtimeState.value.status !== 'offline'
      || runtimeState.value.pid !== null
      || backup?.status === 'invalid'
      || !backup
      || isCreatingRuntimeBackup.value
      || deletingRuntimeBackupId.value !== null
      || validatingRuntimeBackupId.value !== null
      || restoringRuntimeBackupId.value !== null
    ) {
      return false
    }
    validatingRuntimeBackupId.value = backupId
    runtimeRecoveryError.value = null
    try {
      const validated = await options.api.localChat.runtime.validateDataBackup(backupId)
      upsertRuntimeDataBackup(validated)
      return validated.status === 'valid'
    }
    catch {
      runtimeRecoveryError.value = translateBuddy(
        language.value,
        'desktop.agent.runtimeBackupValidationFailed',
      )
      return false
    }
    finally {
      validatingRuntimeBackupId.value = null
    }
  }

  async function restoreRuntimeDataBackup(backupId: string) {
    const backup = runtimeDataBackups.value.find(item => item.id === backupId)
    if (
      runtimeState.value.status !== 'offline'
      || runtimeState.value.pid !== null
      || backup?.status !== 'valid'
      || backup.restoreCapacity?.sufficient !== true
      || restoringRuntimeBackupId.value !== null
      || isCreatingRuntimeBackup.value
      || deletingRuntimeBackupId.value !== null
    ) {
      return false
    }
    startingRuntimeDataOperation.value = { backupId, kind: 'restore' }
    runtimeRecoveryError.value = null
    latestRuntimeBackupPath.value = null
    latestRuntimeRestore.value = null
    const generation = runtimeDataOperationGeneration
    try {
      const operation = await options.api.localChat.runtime.startDataRestore(backupId)
      if (generation === runtimeDataOperationGeneration)
        applyRuntimeDataOperation(operation)
      return true
    }
    catch {
      runtimeRecoveryError.value = translateBuddy(
        language.value,
        'desktop.agent.runtimeRestoreFailed',
      )
      return false
    }
    finally {
      startingRuntimeDataOperation.value = null
    }
  }

  async function cancelRuntimeDataOperation() {
    const operation = runtimeDataOperation.value
    if (!operation || !canCancelRuntimeDataOperation.value)
      return false
    const generation = runtimeDataOperationGeneration
    try {
      const cancelling = await options.api.localChat.runtime.cancelDataOperation(
        operation.operationId,
      )
      if (generation === runtimeDataOperationGeneration)
        applyRuntimeDataOperation(cancelling)
      return true
    }
    catch {
      runtimeRecoveryError.value = translateBuddy(
        language.value,
        operation.kind === 'backup'
          ? 'desktop.agent.runtimeBackupFailed'
          : 'desktop.agent.runtimeRestoreFailed',
      )
      return false
    }
  }

  async function deleteRuntimeDataBackup(backupId: string) {
    const backup = runtimeDataBackups.value.find(item => item.id === backupId)
    if (
      runtimeState.value.status !== 'offline'
      || runtimeState.value.pid !== null
      || !backup
      || isCreatingRuntimeBackup.value
      || deletingRuntimeBackupId.value !== null
      || restoringRuntimeBackupId.value !== null
      || validatingRuntimeBackupId.value !== null
    ) {
      return false
    }
    deletingRuntimeBackupId.value = backupId
    runtimeRecoveryError.value = null
    try {
      await options.api.localChat.runtime.deleteDataBackup(backupId)
      runtimeDataBackups.value = runtimeDataBackups.value.filter(item => item.id !== backupId)
      if (latestRuntimeBackupPath.value === backup.path)
        latestRuntimeBackupPath.value = null
      if (latestRuntimeRestore.value?.safetyBackup.id === backupId)
        latestRuntimeRestore.value = null
      runtimeDataBackupStorage.value = await options.api.localChat.runtime
        .getDataBackupStorage()
        .catch(() => null)
      return true
    }
    catch {
      runtimeRecoveryError.value = translateBuddy(
        language.value,
        'desktop.agent.runtimeBackupDeleteFailed',
      )
      return false
    }
    finally {
      deletingRuntimeBackupId.value = null
    }
  }

  async function openRuntimeDataDirectory() {
    if (!canOpenRuntimeDataDirectory.value || isOpeningRuntimeDataDirectory.value)
      return false
    isOpeningRuntimeDataDirectory.value = true
    runtimeRecoveryError.value = null
    try {
      await options.api.localChat.runtime.openDataDirectory()
      return true
    }
    catch {
      runtimeRecoveryError.value = translateBuddy(
        language.value,
        'desktop.agent.runtimeDataDirectoryOpenFailed',
      )
      return false
    }
    finally {
      isOpeningRuntimeDataDirectory.value = false
    }
  }

  async function updateSettings(patch: LexoraConfigPatch) {
    settingsError.value = null
    try {
      applyConfig(await options.api.settings.update(patch))
      return true
    }
    catch {
      settingsError.value = translateBuddy(language.value, 'desktop.settings.saveFailed')
      return false
    }
  }

  function selectModel(value: string) {
    const model = models.value.find(item => modelKey(item) === value)
    if (!model)
      return
    selectedModelId.value = value
    selectedEffort.value = null
    selectedServiceTier.value = null
  }

  async function setDefaultModel(value: string | null) {
    const model = value ? registeredModels.value.find(item => modelKey(item) === value) : null
    if (value && !model)
      return false
    const current = defaultModelSelection.value
    const reasoning = model && current && modelKey(current) === value
      ? current.reasoning
      : null
    return persistDefaultModel(model
      ? { modelId: model.modelId, providerId: model.providerId, reasoning }
      : null)
  }

  async function setDefaultEffort(value: BuddyThinkingLevel | null) {
    const current = defaultModelSelection.value
    if (!current)
      return false
    const model = registeredModels.value.find(item => modelKey(item) === modelKey(current))
    if (!model || (value !== null && !model.reasoningOptions.includes(value)))
      return false
    return persistDefaultModel({ ...current, reasoning: value })
  }

  async function persistDefaultModel(value: LocalDefaultModel | null) {
    try {
      const stored = await options.api.localChat.providers.setDefaultModel(value)
      defaultModelSelection.value = stored
      if (!selectedModelId.value && defaultModelId.value)
        selectModel(defaultModelId.value)
      return true
    }
    catch (error) {
      agentError.value = normalizeDesktopError(error, language.value)
      return false
    }
  }

  function selectDefaultModel() {
    if (defaultModelId.value && models.value.some(model => modelKey(model) === defaultModelId.value)) {
      selectedModelId.value = defaultModelId.value
      selectedEffort.value = defaultEffort.value
      selectedServiceTier.value = null
    }
    else {
      selectedModelId.value = null
      selectedEffort.value = null
      selectedServiceTier.value = null
    }
  }

  function applyConfig(nextConfig: LexoraConfig) {
    config.value = nextConfig
    language.value = resolveBuddyLocale(nextConfig.desktop.language)
    document.documentElement.lang = language.value
  }

  function reconcileModelSelection() {
    const selected = models.value.find(model => modelKey(model) === selectedModelId.value)
    if (selected) {
      if (
        selectedServiceTier.value !== null
        && !selected.serviceTiers.some(option => option.id === selectedServiceTier.value)
      ) {
        selectedServiceTier.value = null
      }
      return
    }
    selectDefaultModel()
  }

  function upsertRuntimeDataBackup(backup: LocalRuntimeDataBackup) {
    runtimeDataBackups.value = [
      backup,
      ...runtimeDataBackups.value.filter(item => item.id !== backup.id),
    ].sort((left, right) => (right.createdAt ?? '').localeCompare(left.createdAt ?? ''))
  }

  function applyRuntimeDataOperation(operation: LocalRuntimeDataOperation) {
    const current = runtimeDataOperation.value
    if (
      current?.operationId === operation.operationId
      && isTerminalDataOperation(current)
      && !isTerminalDataOperation(operation)
    ) {
      return
    }
    runtimeDataOperation.value = operation
    if (operation.status === 'failed') {
      runtimeRecoveryError.value = translateBuddy(
        language.value,
        operation.kind === 'backup'
          ? 'desktop.agent.runtimeBackupFailed'
          : 'desktop.agent.runtimeRestoreFailed',
      )
      return
    }
    if (operation.status !== 'completed' || !operation.result)
      return
    if (operation.kind === 'backup' && 'id' in operation.result) {
      latestRuntimeBackupPath.value = operation.result.path
      upsertRuntimeDataBackup(operation.result)
    }
    if (operation.kind === 'restore' && 'safetyBackup' in operation.result) {
      latestRuntimeRestore.value = operation.result
      upsertRuntimeDataBackup(operation.result.safetyBackup)
    }
    void options.api.localChat.runtime.getDataBackupStorage()
      .then(storage => runtimeDataBackupStorage.value = storage)
      .catch(() => {})
  }

  return {
    acknowledgeModelSourceUpdate,
    addProvider,
    agentError,
    authChallenge,
    cancelAuth,
    canCreateRuntimeBackup,
    canCancelRuntimeDataOperation,
    canOpenRuntimeDataDirectory,
    canRestartRuntime,
    clearProviderCredential,
    clearAgentError,
    clearConnectorCredential,
    cancelRuntimeDataOperation,
    config,
    connectors,
    connectorsError,
    createRuntimeDataBackup,
    defaultModelId,
    defaultEffort,
    deleteRuntimeDataBackup,
    deletingRuntimeBackupId,
    dispose() {
      stopAuthChallenge()
      stopRuntimeDataOperation()
      stopRuntimeState()
    },
    initialize,
    isLoadingAgent,
    isAuthenticating,
    isLoadingConnectors,
    isLoadingSkills,
    isLoadingUsage,
    isLoadingRuntimeBackups,
    isCreatingRuntimeBackup,
    isOpeningRuntimeDataDirectory,
    latestRuntimeBackupPath,
    latestRuntimeRestore,
    language,
    loadAgent,
    loadConnectors,
    loadSkills,
    loadUsage,
    loadRuntimeDataBackups,
    loginProvider,
    logoutProvider,
    models,
    mutatingProviderId,
    openRuntimeDataDirectory,
    providers,
    registeredModels,
    removeProvider,
    removeConnector,
    respondToAuth,
    restartRuntime,
    restoreRuntimeDataBackup,
    restoreModelSourceParameters,
    restoringRuntimeBackupId,
    runtimeError,
    runtimeDataBackups,
    runtimeDataBackupStorage,
    runtimeDataOperation,
    runtimeDataRecoveryReceipt,
    runtimeRecoveryError,
    runtimeState,
    saveConnector,
    selectedEffort,
    selectedModel,
    selectedModelId,
    selectedServiceTier,
    selectModel,
    selectDefaultModel,
    setDefaultModel,
    setDefaultEffort,
    setModelParameters,
    setConnectorCredential,
    setProviderEnabled,
    setProviderModelEnabled,
    settingsError,
    skills,
    skillsError,
    syncingProviderId,
    syncProviderModels,
    trustConnector,
    updateSettings,
    upsertCustomProvider,
    upsertManualModel,
    usageError,
    usageSnapshot,
    validateRuntimeDataBackup,
    validatingRuntimeBackupId,
  }
}

function isTerminalDataOperation(operation: LocalRuntimeDataOperation): boolean {
  return ['cancelled', 'completed', 'failed'].includes(operation.status)
}

function modelKey(model: Pick<LocalRuntimeModelOption, 'modelId' | 'providerId'>): string {
  return `${model.providerId}:${model.modelId}`
}

export function filterAvailableModels(
  providers: ReadonlyArray<LocalProvider>,
  models: ReadonlyArray<LocalRuntimeModelOption>,
): ReadonlyArray<LocalRuntimeModelOption> {
  const availableProviderIds = new Set(providers
    .filter(provider => provider.added && provider.enabled && provider.status === 'available')
    .map(provider => provider.id))
  return models.filter(model => (
    availableProviderIds.has(model.providerId)
    && model.enabled
    && model.available
  ))
}
