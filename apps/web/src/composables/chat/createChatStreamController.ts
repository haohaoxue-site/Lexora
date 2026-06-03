import type { ChatApi } from './createChatApi'
import type { ChatRuntimeOverlay } from './createChatRuntimeOverlay'
import type { ChatSessionController } from './createChatSessionController'
import type { ChatSessionEvents } from './createChatSessionEvents'
import type {
  ChatModelSelection,
  ChatMutationResponse,
  ChatSessionEvent,
  CreateChatSessionMessageRequest,
  EditAndSendChatMessageRequest,
} from '@/apis/chat'
import { CHAT_SESSION_EVENT_TYPE } from '@haohaoxue/samepage-contracts/chat/constants'
import { watch } from 'vue'
import { ElMessage } from '@/utils/element-plus'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

export interface ChatStreamControllerOptions {
  onSessionCreated?: (sessionId: string) => Promise<void> | void
}

export interface SendChatComposerMessageInput extends CreateChatSessionMessageRequest {
  modelRef?: ChatModelSelection['modelRef'] | null
}

export function createChatStreamController(
  sessions: ChatSessionController,
  runtimeOverlay: ChatRuntimeOverlay,
  sessionEvents: ChatSessionEvents,
  api: ChatApi,
  options: ChatStreamControllerOptions = {},
) {
  const {
    activeSession,
    activeSessionId,
    createSession,
    patchSessionSummary,
    refreshActiveSession,
    replaceActiveSession,
    selectSession,
  } = sessions
  const {
    activeCursor,
    applyEvent,
    cancelRunId,
    currentRun,
    isStreaming,
    seedFromMutationResponse,
  } = runtimeOverlay
  const {
    startSessionEventStream,
    stopSessionEventStream,
  } = sessionEvents

  watch(activeSessionId, (sessionId, previousSessionId) => {
    if (previousSessionId && previousSessionId !== sessionId) {
      stopSessionEventStream(previousSessionId)
    }

    if (sessionId && currentRun.value) {
      startActiveSessionEventStream()
    }
  })

  watch(currentRun, (run) => {
    if (!activeSessionId.value) {
      return
    }

    if (run) {
      startActiveSessionEventStream()
      return
    }

    stopSessionEventStream(activeSessionId.value)
  }, { immediate: true })

  async function sendMessage(input: SendChatComposerMessageInput): Promise<boolean> {
    const content = input.content.trim()
    if (!content || isStreaming.value) {
      return false
    }

    const session = await ensureSessionReady(input.modelRef)
    if (!session) {
      return false
    }

    try {
      handleMutationResponse(await api.sendMessage(session.id, {
        content,
        contentJSON: input.contentJSON,
        attachments: input.attachments ?? [],
      }))
      return true
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '发送消息失败'))
      return false
    }
  }

  async function editAndSendMessage(messageId: string, payload: EditAndSendChatMessageRequest): Promise<boolean> {
    const content = payload.content.trim()
    if (!activeSession.value || !content || isStreaming.value) {
      return false
    }

    try {
      handleMutationResponse(await api.editAndSendMessage(activeSession.value.id, messageId, {
        content,
        contentJSON: payload.contentJSON,
        attachments: payload.attachments ?? [],
      }))
      return true
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '发送失败'))
      return false
    }
  }

  async function retryMessage(messageId: string): Promise<boolean> {
    if (!activeSession.value || isStreaming.value) {
      return false
    }

    try {
      handleMutationResponse(await api.retryAssistantMessage(activeSession.value.id, messageId))
      return true
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '重试失败'))
      return false
    }
  }

  async function switchBranch(messageId: string): Promise<boolean> {
    if (!activeSession.value || isStreaming.value) {
      return false
    }

    try {
      handleMutationResponse(await api.switchActiveMessage(activeSession.value.id, {
        messageId,
      }))
      return true
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '切换分支失败'))
      return false
    }
  }

  async function cancelActiveRun(): Promise<boolean> {
    if (!cancelRunId.value) {
      return false
    }

    try {
      handleMutationResponse(await api.cancelRun(cancelRunId.value))
      return true
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '停止生成失败'))
      return false
    }
  }

  function handleMutationResponse(response: ChatMutationResponse): void {
    const accepted = replaceActiveSession(response.session)
    if (!accepted) {
      return
    }

    seedFromMutationResponse(response)

    if (response.run) {
      startSessionEventStream(response.session.id, response.latestSequence, handleSessionEvent)
    }
  }

  async function handleSessionEvent(event: ChatSessionEvent): Promise<void> {
    if (event.sessionId !== activeSessionId.value) {
      return
    }

    applyEvent(event)

    if (event.type === CHAT_SESSION_EVENT_TYPE.SNAPSHOT_REQUIRED) {
      const session = await refreshActiveSession(event.sessionId)
      if (session) {
        startSessionEventStream(event.sessionId, event.payload.latestSequence, handleSessionEvent)
      }
      return
    }

    if (event.type === CHAT_SESSION_EVENT_TYPE.BRANCH_SWITCHED || event.type === CHAT_SESSION_EVENT_TYPE.MESSAGE_CREATED) {
      const session = await refreshActiveSession(event.sessionId)
      if (session && currentRun.value) {
        startActiveSessionEventStream()
      }
      return
    }

    if (isTerminalEvent(event)) {
      if (!isStreaming.value) {
        stopSessionEventStream(event.sessionId)
      }

      patchSessionSummary(event.sessionId, {
        updatedAt: event.createdAt,
      })
    }
  }

  async function ensureSessionReady(modelRef?: ChatModelSelection['modelRef'] | null) {
    let sessionId = activeSessionId.value
    if (!sessionId) {
      const createdSession = await createSession()
      sessionId = createdSession?.id ?? null
      if (sessionId) {
        await options.onSessionCreated?.(sessionId)
      }
    }

    if (!sessionId) {
      return null
    }

    if (!activeSession.value || activeSession.value.id !== sessionId) {
      await selectSession(sessionId)
    }

    if (modelRef && activeSession.value && !isSameModelRef(modelRef, activeSession.value.modelRef)) {
      const updatedSession = await api.updateSessionModel(activeSession.value.id, {
        modelRef,
      })
      replaceActiveSession(updatedSession)
    }

    return activeSession.value
  }

  function startActiveSessionEventStream(): void {
    if (!activeSessionId.value) {
      return
    }

    startSessionEventStream(
      activeSessionId.value,
      activeCursor.value ?? activeSession.value?.latestSequence ?? null,
      handleSessionEvent,
    )
  }

  return {
    cancelActiveRun,
    cancelRunId,
    editAndSendMessage,
    isStreaming,
    retryMessage,
    sendMessage,
    switchBranch,
  }
}

function isTerminalEvent(event: ChatSessionEvent): boolean {
  return event.type === CHAT_SESSION_EVENT_TYPE.RUN_COMPLETED
    || event.type === CHAT_SESSION_EVENT_TYPE.RUN_FAILED
    || event.type === CHAT_SESSION_EVENT_TYPE.RUN_CANCELLED
    || event.type === CHAT_SESSION_EVENT_TYPE.MESSAGE_COMPLETED
    || event.type === CHAT_SESSION_EVENT_TYPE.MESSAGE_FAILED
    || event.type === CHAT_SESSION_EVENT_TYPE.MESSAGE_CANCELLED
}

function isSameModelRef(
  left: ChatModelSelection['modelRef'] | null,
  right: ChatModelSelection['modelRef'] | null,
) {
  return Boolean(left && right && left.providerId === right.providerId && left.modelId === right.modelId)
}

export type ChatStreamController = ReturnType<typeof createChatStreamController>
