import type { ShallowRef } from 'vue'
import type { ChatModelItem, ChatModelSelection, ChatRuntimeConfig, ChatSessionDetail, ChatSessionSummary } from '@/apis/chat'
import { ElMessage } from 'element-plus'
import { computed, onMounted, reactive, shallowRef } from 'vue'
import {
  createChatSession,
  deleteChatSession,
  getChatModels,
  getChatRuntimeConfig,
  getChatSession,
  getChatSessions,
  streamChatCompletion,
  updateChatSessionModel,
} from '@/apis/chat'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import { formatModelOptionLabel } from '@/views/provider/utils/aiModel'

/**
 * 聊天会话摘要模型。
 */
export interface ChatSession extends ChatSessionSummary {}

/**
 * 当前激活会话详情模型。
 */
export interface ActiveChatSession extends ChatSessionDetail {}

function createModelSelection(modelRef: ChatModelSelection['modelRef'] | null = null): ChatModelSelection {
  return {
    modelRef: modelRef ?? null,
  }
}

function normalizeNullableModelRef(
  value: ChatModelSelection['modelRef'] | null | undefined,
): ChatModelSelection['modelRef'] | null {
  if (!value) {
    return null
  }

  return normalizeModelSelection({ modelRef: value }).modelRef ?? null
}

function toModelRef(value: Pick<ChatModelItem, 'configId' | 'modelId'> | null | undefined): ChatModelSelection['modelRef'] | null {
  if (!value) {
    return null
  }

  return {
    configId: value.configId.trim(),
    modelId: value.modelId.trim(),
  }
}

function normalizeModelSelection(value: ChatModelSelection): ChatModelSelection {
  return {
    modelRef: value.modelRef
      ? {
          configId: value.modelRef.configId.trim(),
          modelId: value.modelRef.modelId.trim(),
        }
      : null,
  }
}

export function resolveSavedChatModelRef(
  value: ChatModelSelection,
): NonNullable<ChatModelSelection['modelRef']> | null {
  const modelRef = normalizeModelSelection(value).modelRef
  return modelRef ?? null
}

function toDraft(value: ChatModelSelection): ChatModelSelection {
  return {
    modelRef: value.modelRef
      ? { ...value.modelRef }
      : null,
  }
}

function createEmptyRuntimeConfig(): ChatRuntimeConfig {
  return {
    enabled: false,
    ready: false,
    defaultModel: null,
    notReadyReason: null,
  }
}

function findMatchingModelOption(
  modelOptions: ChatModelItem[],
  modelRef: NonNullable<ChatModelSelection['modelRef']>,
): ChatModelItem | null {
  return modelOptions.find(model => model.configId === modelRef.configId && model.modelId === modelRef.modelId) ?? null
}

export function resolveSelectedChatModel(
  modelRef: ChatModelSelection['modelRef'] | null | undefined,
  modelOptions: ChatModelItem[],
  runtimeDefaultModel: ChatModelItem | null,
): ChatModelItem | null {
  const normalizedModelRef = normalizeNullableModelRef(modelRef)

  if (normalizedModelRef) {
    const matchedModel = findMatchingModelOption(modelOptions, normalizedModelRef)
    if (matchedModel?.selectable) {
      return matchedModel
    }

    if (
      runtimeDefaultModel
      && runtimeDefaultModel.configId === normalizedModelRef.configId
      && runtimeDefaultModel.modelId === normalizedModelRef.modelId
    ) {
      return runtimeDefaultModel
    }

    return null
  }

  return runtimeDefaultModel ?? null
}

export function resolveChatRequestModelRef(
  modelRef: ChatModelSelection['modelRef'] | null | undefined,
  _modelOptions: ChatModelItem[],
  runtimeDefaultModel: ChatModelItem | null,
): ChatModelSelection['modelRef'] | null {
  const normalizedModelRef = normalizeNullableModelRef(modelRef)

  if (normalizedModelRef) {
    return normalizedModelRef
  }

  return toModelRef(runtimeDefaultModel)
}

export function resolveLoadedChatModelRef(
  modelRef: ChatModelSelection['modelRef'] | null | undefined,
  modelOptions: ChatModelItem[],
  runtimeDefaultModel: ChatModelItem | null,
): ChatModelSelection['modelRef'] | null {
  const normalizedModelRef = normalizeNullableModelRef(modelRef)

  if (normalizedModelRef) {
    const matchedModel = findMatchingModelOption(modelOptions, normalizedModelRef)
    if (matchedModel?.selectable) {
      return toModelRef(matchedModel)
    }
  }

  return toModelRef(runtimeDefaultModel)
}

export function useChat() {
  const workspace = useChatWorkspaceState()
  const providerSettings = useChatProviderSettingsState({
    activeSession: workspace.activeSession,
    ensureActiveSession: workspace.ensureActiveSession,
    replaceActiveSession: workspace.replaceActiveSession,
  })
  const modelBadgeStateClass = computed(() => providerSettings.isConfigured.value ? 'configured' : 'idle')

  return {
    ...providerSettings,
    ...workspace,
    modelBadgeStateClass,
  }
}

function useChatProviderSettingsState(options: {
  activeSession: ShallowRef<ActiveChatSession | null>
  ensureActiveSession: () => Promise<ActiveChatSession | null>
  replaceActiveSession: (session: ActiveChatSession) => void
}) {
  const dialogVisible = shallowRef(false)
  const isLoadingRuntimeConfig = shallowRef(true)
  const isLoadingModels = shallowRef(false)
  const runtimeConfig = shallowRef<ChatRuntimeConfig>(createEmptyRuntimeConfig())
  const modelOptions = shallowRef<ChatModelItem[]>([])
  const draft = reactive<ChatModelSelection>(toDraft(createModelSelection()))
  const sessionModelRef = computed(() => options.activeSession.value?.modelRef ?? null)
  const manualModelRef = computed(() => normalizeNullableModelRef(sessionModelRef.value))
  const selectedModel = computed(() => resolveSelectedChatModel(
    sessionModelRef.value,
    modelOptions.value,
    runtimeConfig.value.defaultModel,
  ))
  const requestModelRef = computed(() => resolveChatRequestModelRef(
    sessionModelRef.value,
    modelOptions.value,
    runtimeConfig.value.defaultModel,
  ))
  const isConfigured = computed(() => Boolean(requestModelRef.value))
  const currentModelLabel = computed(() => {
    if (selectedModel.value) {
      return formatModelOptionLabel(selectedModel.value.providerName, selectedModel.value.modelName)
    }

    return manualModelRef.value?.modelId ?? '未选择模型'
  })
  const currentProviderLabel = computed(() => {
    if (isLoadingRuntimeConfig.value && !requestModelRef.value) {
      return '正在加载 AI 服务状态'
    }

    if (manualModelRef.value) {
      return '当前使用此会话选择的模型'
    }

    if (!runtimeConfig.value.ready && !isConfigured.value) {
      return '请选择模型后开始聊天'
    }

    return runtimeConfig.value.defaultModel
      ? formatModelOptionLabel(runtimeConfig.value.defaultModel.providerName, runtimeConfig.value.defaultModel.modelName)
      : 'AI 服务已就绪'
  })
  const inputPlaceholder = computed(() => {
    if (isLoadingRuntimeConfig.value && !requestModelRef.value) {
      return '正在加载 AI 服务状态'
    }

    if (!isConfigured.value) {
      return '请先选择模型'
    }

    return '输入消息...'
  })

  onMounted(() => {
    void loadInitialState()
  })

  async function loadInitialState() {
    const hasRuntimeConfig = await loadRuntimeConfig()
    if (!hasRuntimeConfig) {
      return
    }

    await refreshModels({
      silent: true,
      showSuccessMessage: false,
      skipRuntimeConfigReload: true,
    })
  }

  async function loadRuntimeConfig(options: { silent?: boolean } = {}) {
    const { silent = false } = options
    isLoadingRuntimeConfig.value = true

    try {
      runtimeConfig.value = await getChatRuntimeConfig()
      return true
    }
    catch (error) {
      if (!silent) {
        ElMessage.error(getRequestErrorDisplayMessage(error, '加载 AI 服务状态失败'))
      }

      return false
    }
    finally {
      isLoadingRuntimeConfig.value = false
    }
  }

  async function openDialog() {
    const session = await options.ensureActiveSession()
    if (!session) {
      return
    }

    Object.assign(draft, toDraft(createModelSelection(session.modelRef ?? runtimeConfig.value.defaultModel ?? null)))
    dialogVisible.value = true
  }

  async function refreshModels(options: { silent?: boolean, showSuccessMessage?: boolean, skipRuntimeConfigReload?: boolean } = {}) {
    const {
      silent = false,
      showSuccessMessage = true,
      skipRuntimeConfigReload = false,
    } = options

    const hasRuntimeConfig = skipRuntimeConfigReload
      ? true
      : await loadRuntimeConfig({ silent })

    if (!hasRuntimeConfig) {
      return
    }

    isLoadingModels.value = true

    try {
      const result = await getChatModels()
      modelOptions.value = result.models

      const nextDraftModelRef = resolveLoadedChatModelRef(
        draft.modelRef ?? null,
        result.models,
        runtimeConfig.value.defaultModel,
      )

      if (nextDraftModelRef) {
        draft.modelRef = { ...nextDraftModelRef }
      }
      else {
        draft.modelRef = null
      }

      if (showSuccessMessage) {
        ElMessage.success(result.models.length > 0 ? `已获取 ${result.models.length} 个模型` : '当前未获取到可用模型')
      }
    }
    catch (error) {
      modelOptions.value = []

      if (!silent) {
        ElMessage.error(getRequestErrorDisplayMessage(error, '获取模型列表失败'))
      }
    }
    finally {
      isLoadingModels.value = false
    }
  }

  async function saveSettings() {
    const session = await options.ensureActiveSession()
    if (!session) {
      return false
    }

    const nextModelRef = resolveSavedChatModelRef(draft)

    try {
      const updatedSession = await updateChatSessionModel(session.id, {
        modelRef: nextModelRef,
      })
      options.replaceActiveSession(updatedSession)
      Object.assign(draft, toDraft(createModelSelection(updatedSession.modelRef)))
      dialogVisible.value = false
      ElMessage.success(nextModelRef ? '聊天模型已保存' : '已恢复默认模型')
      return true
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '保存聊天模型失败'))
      return false
    }
  }

  return {
    currentModelLabel,
    currentProviderLabel,
    dialogVisible,
    draft,
    inputPlaceholder,
    isConfigured,
    isLoadingModels,
    isLoadingRuntimeConfig,
    modelOptions,
    openDialog,
    requestModelRef,
    refreshModels,
    saveSettings,
    selectedModel,
  }
}

function useChatWorkspaceState() {
  const sessions = shallowRef<ChatSession[]>([])
  const activeSessionId = shallowRef<string | null>(null)
  const activeSession = shallowRef<ActiveChatSession | null>(null)
  const isLoadingSessions = shallowRef(false)
  const isStreaming = shallowRef(false)
  const streamingContent = shallowRef('')

  void loadSessions()

  async function loadSessions(options: { preserveActiveSessionId?: boolean } = {}) {
    const { preserveActiveSessionId = true } = options
    isLoadingSessions.value = true

    try {
      const nextSessions = await getChatSessions()
      sessions.value = nextSessions

      if (nextSessions.length === 0) {
        activeSessionId.value = null
        activeSession.value = null
        return
      }

      const nextActiveSessionId = preserveActiveSessionId && activeSessionId.value && nextSessions.some(session => session.id === activeSessionId.value)
        ? activeSessionId.value
        : nextSessions[0].id

      if (!nextActiveSessionId) {
        activeSessionId.value = null
        activeSession.value = null
        return
      }

      await selectSession(nextActiveSessionId)
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '加载聊天会话失败'))
    }
    finally {
      isLoadingSessions.value = false
    }
  }

  async function createSession() {
    try {
      const session = await createChatSession()
      prependSessionSummary(session)
      activeSessionId.value = session.id
      activeSession.value = session
      return session
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '创建聊天会话失败'))
      return null
    }
  }

  async function ensureActiveSession() {
    if (activeSession.value) {
      return activeSession.value
    }

    if (activeSessionId.value) {
      await selectSession(activeSessionId.value)
      return activeSession.value
    }

    return createSession()
  }

  function replaceActiveSession(session: ActiveChatSession) {
    activeSessionId.value = session.id
    activeSession.value = session
    patchSessionSummary(session.id, {
      modelRef: session.modelRef,
      title: session.title,
      updatedAt: session.updatedAt,
    })
  }

  async function selectSession(id: string) {
    const isCurrentSession = activeSession.value?.id === id
    activeSessionId.value = id

    if (isCurrentSession) {
      return
    }

    try {
      activeSession.value = await getChatSession(id)
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '加载聊天会话失败'))
    }
  }

  async function deleteSession(id: string) {
    try {
      await deleteChatSession(id)
      sessions.value = sessions.value.filter(session => session.id !== id)

      if (activeSessionId.value !== id) {
        return
      }

      const nextSession = sessions.value[0]
      if (!nextSession) {
        activeSessionId.value = null
        activeSession.value = null
        return
      }

      await selectSession(nextSession.id)
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '删除聊天会话失败'))
    }
  }

  async function sendMessage(content: string) {
    if (!content.trim() || isStreaming.value) {
      return
    }

    let sessionId = activeSessionId.value
    if (!sessionId) {
      const createdSession = await createSession()
      sessionId = createdSession?.id ?? null
    }

    if (!sessionId) {
      return
    }

    if (!activeSession.value || activeSession.value.id !== sessionId) {
      await selectSession(sessionId)
    }

    const session = activeSession.value
    if (!session) {
      return
    }

    const normalizedContent = content.trim()
    const nextTitle = session.messages.length === 0
      ? buildSessionTitle(normalizedContent)
      : session.title

    activeSession.value = {
      ...session,
      title: nextTitle,
      messages: [
        ...session.messages,
        { role: 'user', content: normalizedContent },
        { role: 'assistant', content: '' },
      ],
    }

    patchSessionSummary(session.id, {
      title: nextTitle,
    })

    isStreaming.value = true
    streamingContent.value = ''
    try {
      await streamChatCompletion(
        session.id,
        normalizedContent,
        (chunk) => {
          streamingContent.value += chunk
          updateActiveAssistantMessage(streamingContent.value)
        },
      )

      await refreshActiveSession(session.id)
      await refreshSessionList()
    }
    catch (error) {
      updateActiveAssistantMessage(
        getRequestErrorDisplayMessage(error, '抱歉，请求失败，请稍后重试。'),
        { onlyWhenEmpty: true },
      )
    }
    finally {
      isStreaming.value = false
      streamingContent.value = ''
    }
  }

  async function refreshActiveSession(sessionId: string) {
    try {
      activeSession.value = await getChatSession(sessionId)
      activeSessionId.value = sessionId
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '刷新聊天详情失败'))
    }
  }

  async function refreshSessionList() {
    try {
      sessions.value = await getChatSessions()
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '刷新聊天列表失败'))
    }
  }

  function prependSessionSummary(session: ChatSessionSummary) {
    sessions.value = [
      session,
      ...sessions.value.filter(item => item.id !== session.id),
    ]
  }

  function patchSessionSummary(
    sessionId: string,
    input: Partial<Pick<ChatSessionSummary, 'modelRef' | 'title' | 'updatedAt'>>,
  ) {
    const targetSession = sessions.value.find(session => session.id === sessionId)

    if (!targetSession) {
      return
    }

    sessions.value = [
      {
        ...targetSession,
        ...input,
      },
      ...sessions.value.filter(session => session.id !== sessionId),
    ]
  }

  function updateActiveAssistantMessage(
    content: string,
    options: { onlyWhenEmpty?: boolean } = {},
  ) {
    if (!activeSession.value) {
      return
    }

    const lastMessage = activeSession.value.messages.at(-1)
    if (lastMessage?.role !== 'assistant') {
      return
    }

    if (options.onlyWhenEmpty && lastMessage.content) {
      return
    }

    const nextMessages = [...activeSession.value.messages]
    nextMessages[nextMessages.length - 1] = {
      role: 'assistant',
      content,
    }

    activeSession.value = {
      ...activeSession.value,
      messages: nextMessages,
    }
  }

  return {
    activeSession,
    activeSessionId,
    createSession,
    deleteSession,
    ensureActiveSession,
    isLoadingSessions,
    isStreaming,
    replaceActiveSession,
    selectSession,
    sendMessage,
    sessions,
  }
}

function buildSessionTitle(content: string) {
  return content.slice(0, 30) + (content.length > 30 ? '...' : '')
}
