import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type {
  LocalBuddyServiceSupervisorState,
  LocalRuntimeDataBackup,
  LocalRuntimeDataBackupStorage,
  LocalRuntimeDataOperation,
  LocalRuntimeDataRecoveryReceipt,
  LocalRuntimeDataRestore,
} from '@buddy-electron/shared/localChatApi'
import type { ShallowRef } from 'vue'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { computed, readonly, shallowRef, watch } from 'vue'
import { translateBuddy } from '@/i18n/buddyI18n'

interface UseRuntimeRecoveryStoreOptions {
  api: LexoraDesktopApi['localChat']['runtime']
  language: Readonly<ShallowRef<BuddyLocale>>
  runtimeState: Readonly<ShallowRef<LocalBuddyServiceSupervisorState>>
}

export function useRuntimeRecoveryStore(options: UseRuntimeRecoveryStoreOptions) {
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
  const runtimeRecoveryError = shallowRef<string | null>(null)
  let initialized = false
  let operationGeneration = 0

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
    options.runtimeState.value.status === 'offline'
    && options.runtimeState.value.pid === null
    && !isRuntimeDataOperationActive.value
    && deletingRuntimeBackupId.value === null
    && validatingRuntimeBackupId.value === null
  ))
  const canCreateRuntimeBackup = computed(() => (
    options.runtimeState.value.status === 'offline'
    && options.runtimeState.value.pid === null
    && runtimeDataBackupStorage.value?.canCreateBackup !== false
    && !isRuntimeDataOperationActive.value
    && deletingRuntimeBackupId.value === null
    && validatingRuntimeBackupId.value === null
  ))
  const canOpenRuntimeDataDirectory = computed(() => (
    options.runtimeState.value.status === 'offline'
    && !isRuntimeDataOperationActive.value
    && deletingRuntimeBackupId.value === null
  ))
  const stopRuntimeDataOperation = options.api.onDataOperationChanged((operation) => {
    operationGeneration += 1
    applyRuntimeDataOperation(operation)
  })
  const stopRuntimeStateWatch = watch(options.runtimeState, (state, previous) => {
    if (state.status !== 'offline') {
      resetRecoveryState()
      return
    }
    if (initialized && previous.status !== 'offline' && state.pid === null)
      void loadRuntimeDataBackups()
  })

  async function loadInitialOperation() {
    const generation = operationGeneration
    const operation = await options.api.getDataOperation()
    if (generation === operationGeneration && operation)
      applyRuntimeDataOperation(operation)
  }

  async function loadRecoveryReceipt() {
    runtimeDataRecoveryReceipt.value = await options.api.getDataRecoveryReceipt()
  }

  async function markInitialized() {
    initialized = true
    if (options.runtimeState.value.status === 'offline' && options.runtimeState.value.pid === null)
      await loadRuntimeDataBackups()
  }

  async function createRuntimeDataBackup() {
    if (!canCreateRuntimeBackup.value || isCreatingRuntimeBackup.value)
      return false
    startingRuntimeDataOperation.value = { backupId: null, kind: 'backup' }
    runtimeRecoveryError.value = null
    latestRuntimeBackupPath.value = null
    latestRuntimeRestore.value = null
    const generation = operationGeneration
    try {
      const operation = await options.api.startDataBackup()
      if (generation === operationGeneration)
        applyRuntimeDataOperation(operation)
      return true
    }
    catch {
      runtimeRecoveryError.value = translateBuddy(
        options.language.value,
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
      options.runtimeState.value.status !== 'offline'
      || options.runtimeState.value.pid !== null
      || isLoadingRuntimeBackups.value
    ) {
      return false
    }
    isLoadingRuntimeBackups.value = true
    runtimeRecoveryError.value = null
    try {
      const [backups, storage] = await Promise.all([
        options.api.listDataBackups(),
        options.api.getDataBackupStorage(),
      ])
      runtimeDataBackups.value = backups
      runtimeDataBackupStorage.value = storage
      return true
    }
    catch {
      runtimeRecoveryError.value = translateBuddy(
        options.language.value,
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
      options.runtimeState.value.status !== 'offline'
      || options.runtimeState.value.pid !== null
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
      const validated = await options.api.validateDataBackup(backupId)
      upsertRuntimeDataBackup(validated)
      return validated.status === 'valid'
    }
    catch {
      runtimeRecoveryError.value = translateBuddy(
        options.language.value,
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
      options.runtimeState.value.status !== 'offline'
      || options.runtimeState.value.pid !== null
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
    const generation = operationGeneration
    try {
      const operation = await options.api.startDataRestore(backupId)
      if (generation === operationGeneration)
        applyRuntimeDataOperation(operation)
      return true
    }
    catch {
      runtimeRecoveryError.value = translateBuddy(
        options.language.value,
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
    const generation = operationGeneration
    try {
      const cancelling = await options.api.cancelDataOperation(operation.operationId)
      if (generation === operationGeneration)
        applyRuntimeDataOperation(cancelling)
      return true
    }
    catch {
      runtimeRecoveryError.value = translateBuddy(
        options.language.value,
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
      options.runtimeState.value.status !== 'offline'
      || options.runtimeState.value.pid !== null
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
      await options.api.deleteDataBackup(backupId)
      runtimeDataBackups.value = runtimeDataBackups.value.filter(item => item.id !== backupId)
      if (latestRuntimeBackupPath.value === backup.path)
        latestRuntimeBackupPath.value = null
      if (latestRuntimeRestore.value?.safetyBackup.id === backupId)
        latestRuntimeRestore.value = null
      runtimeDataBackupStorage.value = await options.api.getDataBackupStorage().catch(() => null)
      return true
    }
    catch {
      runtimeRecoveryError.value = translateBuddy(
        options.language.value,
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
      await options.api.openDataDirectory()
      return true
    }
    catch {
      runtimeRecoveryError.value = translateBuddy(
        options.language.value,
        'desktop.agent.runtimeDataDirectoryOpenFailed',
      )
      return false
    }
    finally {
      isOpeningRuntimeDataDirectory.value = false
    }
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
        options.language.value,
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
    void options.api.getDataBackupStorage()
      .then(storage => runtimeDataBackupStorage.value = storage)
      .catch(() => {})
  }

  function resetRecoveryState() {
    runtimeRecoveryError.value = null
    runtimeDataBackups.value = []
    runtimeDataBackupStorage.value = null
    latestRuntimeRestore.value = null
    latestRuntimeBackupPath.value = null
  }

  function dispose() {
    stopRuntimeDataOperation()
    stopRuntimeStateWatch()
  }

  return {
    canCancelRuntimeDataOperation: readonly(canCancelRuntimeDataOperation),
    canCreateRuntimeBackup: readonly(canCreateRuntimeBackup),
    canOpenRuntimeDataDirectory: readonly(canOpenRuntimeDataDirectory),
    canRestartRuntime: readonly(canRestartRuntime),
    cancelRuntimeDataOperation,
    createRuntimeDataBackup,
    deleteRuntimeDataBackup,
    deletingRuntimeBackupId: readonly(deletingRuntimeBackupId),
    dispose,
    isCreatingRuntimeBackup: readonly(isCreatingRuntimeBackup),
    isLoadingRuntimeBackups: readonly(isLoadingRuntimeBackups),
    isOpeningRuntimeDataDirectory: readonly(isOpeningRuntimeDataDirectory),
    latestRuntimeBackupPath: readonly(latestRuntimeBackupPath),
    latestRuntimeRestore: readonly(latestRuntimeRestore),
    loadInitialOperation,
    loadRecoveryReceipt,
    loadRuntimeDataBackups,
    markInitialized,
    openRuntimeDataDirectory,
    restoreRuntimeDataBackup,
    restoringRuntimeBackupId: readonly(restoringRuntimeBackupId),
    runtimeDataBackups: readonly(runtimeDataBackups),
    runtimeDataBackupStorage: readonly(runtimeDataBackupStorage),
    runtimeDataOperation: readonly(runtimeDataOperation),
    runtimeDataRecoveryReceipt: readonly(runtimeDataRecoveryReceipt),
    runtimeRecoveryError: readonly(runtimeRecoveryError),
    validateRuntimeDataBackup,
    validatingRuntimeBackupId: readonly(validatingRuntimeBackupId),
  }
}

export type RuntimeRecoveryStore = ReturnType<typeof useRuntimeRecoveryStore>

function isTerminalDataOperation(operation: LocalRuntimeDataOperation): boolean {
  return ['cancelled', 'completed', 'failed'].includes(operation.status)
}
