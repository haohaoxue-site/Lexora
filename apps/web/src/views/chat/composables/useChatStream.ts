import type {
  ChatMutationResponse,
  ChatSessionEvent,
} from '@/apis/chat'
import { CHAT_SESSION_EVENT_TYPE } from '@haohaoxue/samepage-contracts'
import { createSharedComposable } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { watch } from 'vue'
import {
  cancelChatRun,
  editAndSendChatMessage,
  retryChatAssistantMessage,
  sendChatSessionMessage,
  switchChatActiveMessage,
} from '@/apis/chat'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import { useChatRuntimeOverlay } from './useChatRuntimeOverlay'
import { useChatSessionEvents } from './useChatSessionEvents'
import { useChatSessions } from './useChatSessions'

export const useChatStream = createSharedComposable(() => {
  const {
    activeSession,
    activeSessionId,
    createSession,
    refreshActiveSession,
    refreshSessionList,
    replaceActiveSession,
    selectSession,
  } = useChatSessions()
  const {
    activeCursor,
    applyEvent,
    cancelRunId,
    currentRun,
    isStreaming,
    seedFromMutationResponse,
  } = useChatRuntimeOverlay()
  const {
    startSessionEventStream,
    stopSessionEventStream,
  } = useChatSessionEvents()

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

  async function sendMessage(content: string): Promise<boolean> {
    if (!content.trim() || isStreaming.value) {
      return false
    }

    const session = await ensureSessionReady()
    if (!session) {
      return false
    }

    try {
      handleMutationResponse(await sendChatSessionMessage(session.id, {
        content: content.trim(),
      }))
      return true
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '发送消息失败'))
      return false
    }
  }

  async function editAndSendMessage(messageId: string, content: string): Promise<boolean> {
    if (!activeSession.value || !content.trim() || isStreaming.value) {
      return false
    }

    try {
      handleMutationResponse(await editAndSendChatMessage(activeSession.value.id, messageId, {
        content: content.trim(),
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
      handleMutationResponse(await retryChatAssistantMessage(activeSession.value.id, messageId))
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
      handleMutationResponse(await switchChatActiveMessage(activeSession.value.id, {
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
      handleMutationResponse(await cancelChatRun(cancelRunId.value))
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

    void refreshSessionList()
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

      await refreshSessionList()
    }
  }

  async function ensureSessionReady() {
    let sessionId = activeSessionId.value
    if (!sessionId) {
      const createdSession = await createSession()
      sessionId = createdSession?.id ?? null
    }

    if (!sessionId) {
      return null
    }

    if (!activeSession.value || activeSession.value.id !== sessionId) {
      await selectSession(sessionId)
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
})

function isTerminalEvent(event: ChatSessionEvent): boolean {
  return event.type === CHAT_SESSION_EVENT_TYPE.RUN_COMPLETED
    || event.type === CHAT_SESSION_EVENT_TYPE.RUN_FAILED
    || event.type === CHAT_SESSION_EVENT_TYPE.RUN_CANCELLED
    || event.type === CHAT_SESSION_EVENT_TYPE.MESSAGE_COMPLETED
    || event.type === CHAT_SESSION_EVENT_TYPE.MESSAGE_FAILED
    || event.type === CHAT_SESSION_EVENT_TYPE.MESSAGE_CANCELLED
}
