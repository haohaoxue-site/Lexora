import type { MaybeRefOrGetter } from 'vue'
import type { ChatModelItem, ChatModelSelection, ChatRuntimeConfig, ChatSessionDetail, ChatSessionSummary } from '@/apis/chat'
import { ElButton, ElMessage, ElNotification } from 'element-plus'
import { computed, h, onMounted, reactive, shallowRef, toValue } from 'vue'
import { useRouter } from 'vue-router'
import {
  createChatSession,
  deleteChatSession,
  getChatModels,
  getChatRuntimeConfig,
  getChatSession,
  getChatSessions,
  streamChatCompletion,
} from '@/apis/chat'
import { useUiStore } from '@/stores/ui'
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
    modelRef: modelRef ?? undefined,
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
      : undefined,
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
      : undefined,
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
    if (matchedModel) {
      return matchedModel
    }

    if (
      runtimeDefaultModel
      && runtimeDefaultModel.configId === normalizedModelRef.configId
      && runtimeDefaultModel.modelId === normalizedModelRef.modelId
    ) {
      return runtimeDefaultModel
    }
  }

  return runtimeDefaultModel ?? null
}

export function resolveChatRequestModelRef(
  modelRef: ChatModelSelection['modelRef'] | null | undefined,
  modelOptions: ChatModelItem[],
  runtimeDefaultModel: ChatModelItem | null,
): ChatModelSelection['modelRef'] | null {
  const normalizedModelRef = normalizeNullableModelRef(modelRef)

  if (normalizedModelRef) {
    const matchedModel = findMatchingModelOption(modelOptions, normalizedModelRef)
    if (matchedModel) {
      return toModelRef(matchedModel)
    }

    if (
      runtimeDefaultModel
      && runtimeDefaultModel.configId === normalizedModelRef.configId
      && runtimeDefaultModel.modelId === normalizedModelRef.modelId
    ) {
      return toModelRef(runtimeDefaultModel)
    }
  }

  return toModelRef(runtimeDefaultModel)
}

export function useChat() {
  const providerSettings = useChatProviderSettingsState()
  const workspace = useChatWorkspaceState(providerSettings.requestModelRef)
  const modelBadgeStateClass = computed(() => providerSettings.isConfigured.value ? 'configured' : 'idle')

  return {
    ...providerSettings,
    ...workspace,
    modelBadgeStateClass,
  }
}

function useChatProviderSettingsState() {
  const uiStore = useUiStore()
  const router = useRouter()
  const dialogVisible = shallowRef(false)
  const isLoadingRuntimeConfig = shallowRef(true)
  const isLoadingModels = shallowRef(false)
  const hasShownDefaultModelNotification = shallowRef(false)
  const runtimeConfig = shallowRef<ChatRuntimeConfig>(createEmptyRuntimeConfig())
  const modelOptions = shallowRef<ChatModelItem[]>([])
  const draft = reactive<ChatModelSelection>(toDraft(createModelSelection(uiStore.chatSelectedModelRef)))
  const selectedModelRef = computed(() => uiStore.chatSelectedModelRef)
  const selectedModel = computed(() => resolveSelectedChatModel(
    selectedModelRef.value,
    modelOptions.value,
    runtimeConfig.value.defaultModel,
  ))
  const requestModelRef = computed(() => resolveChatRequestModelRef(
    selectedModelRef.value,
    modelOptions.value,
    runtimeConfig.value.defaultModel,
  ))
  const isConfigured = computed(() => Boolean(requestModelRef.value))
  const currentModelLabel = computed(() => selectedModel.value
    ? formatModelOptionLabel(selectedModel.value.providerName, selectedModel.value.modelName)
    : '未选择模型')
  const currentProviderLabel = computed(() => {
    if (isLoadingRuntimeConfig.value && !requestModelRef.value) {
      return '正在加载 AI 服务状态'
    }

    if (!runtimeConfig.value.ready && !isConfigured.value) {
      return runtimeConfig.value.notReadyReason || '请先配置默认模型'
    }

    if (!runtimeConfig.value.ready && isConfigured.value) {
      return '默认模型未配置，当前使用手动选择的模型'
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
      return runtimeConfig.value.notReadyReason || '请先选择模型'
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
      notifyDefaultModelMissingIfNeeded(runtimeConfig.value, silent)
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
    Object.assign(draft, toDraft(createModelSelection(uiStore.chatSelectedModelRef ?? runtimeConfig.value.defaultModel ?? null)))
    dialogVisible.value = true
    await refreshModels({
      silent: false,
      showSuccessMessage: false,
    })
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

      const nextDraftModelRef = resolveChatRequestModelRef(
        draft.modelRef ?? null,
        result.models,
        runtimeConfig.value.defaultModel,
      )

      if (nextDraftModelRef) {
        draft.modelRef = { ...nextDraftModelRef }
      }
      else {
        draft.modelRef = undefined
      }

      if (!runtimeConfig.value.ready && !silent) {
        ElMessage.warning(runtimeConfig.value.notReadyReason || '默认模型尚未配置，可先手动选择模型')
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

  function saveSettings() {
    const nextModelRef = resolveSavedChatModelRef(draft)
    uiStore.setChatSelectedModelRef(nextModelRef)
    dialogVisible.value = false
    ElMessage.success(nextModelRef ? '聊天模型已保存' : '已恢复默认模型')
    return true
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
    selectedModel: requestModelRef,
  }

  function notifyDefaultModelMissingIfNeeded(config: ChatRuntimeConfig, silent: boolean) {
    if (silent || config.ready || hasShownDefaultModelNotification.value) {
      return
    }

    hasShownDefaultModelNotification.value = true
    ElNotification({
      title: '默认模型未配置',
      duration: 0,
      showClose: true,
      message: h('div', { class: 'flex flex-col gap-2' }, [
        h('span', config.notReadyReason || '请先为聊天助手配置默认模型。'),
        h(ElButton, {
          type: 'primary',
          size: 'small',
          onClick: () => {
            void router.push('/provider/usage')
          },
        }, () => '前往配置'),
      ]),
    })
  }
}

function useChatWorkspaceState(modelRef: MaybeRefOrGetter<ChatModelSelection['modelRef'] | null>) {
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

    const selectedModelRef = toValue(modelRef)
    if (!selectedModelRef) {
      ElMessage.warning('请先选择可用模型')
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
        selectedModelRef,
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
    input: Partial<Pick<ChatSessionSummary, 'title'>>,
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
    isLoadingSessions,
    isStreaming,
    selectSession,
    sendMessage,
    sessions,
  }
}

function buildSessionTitle(content: string) {
  return content.slice(0, 30) + (content.length > 30 ? '...' : '')
}
