import type {
  ChatMutationResponse,
  ChatRunSummary,
  ChatSessionEvent,
} from '@/apis/chat'
import {
  CHAT_MESSAGE_STATUS,
  CHAT_RUN_STATUS,
  CHAT_SESSION_EVENT_TYPE,
} from '@haohaoxue/samepage-contracts'
import { createSharedComposable } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { computed, shallowRef, watch } from 'vue'
import {
  cancelChatRun,
  editAndSendChatMessage,
  retryChatAssistantMessage,
  sendChatSessionMessage,
  streamChatSessionEvents,
  switchChatActiveMessage,
} from '@/apis/chat'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import { applyChatSessionEventToMessages } from '../utils/chat-stream-message'
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
  const activeRun = shallowRef<ChatRunSummary | null>(null)
  const latestSequenceBySession = new Map<string, number>()
  let eventController: AbortController | null = null
  let eventSessionId: string | null = null

  const isStreaming = computed(() => {
    if (
      activeRun.value
      && (
        activeRun.value.status === CHAT_RUN_STATUS.PENDING
        || activeRun.value.status === CHAT_RUN_STATUS.RUNNING
      )
    ) {
      return true
    }

    return activeSession.value?.messages.some(message =>
      message.status === CHAT_MESSAGE_STATUS.PENDING
      || message.status === CHAT_MESSAGE_STATUS.STREAMING,
    ) ?? false
  })

  watch(activeSessionId, (sessionId) => {
    if (!sessionId) {
      stopSessionEventStream()
      activeRun.value = null
      return
    }

    if (shouldSubscribeSessionEvents(sessionId)) {
      startSessionEventStream(sessionId, latestSequenceBySession.get(sessionId) ?? null)
    }
  })

  watch(activeSession, (session) => {
    activeRun.value = session?.activeRun ?? null

    if (session?.activeRun || (session && shouldSubscribeSessionEvents(session.id))) {
      startSessionEventStream(session.id, latestSequenceBySession.get(session.id) ?? null)
    }
  })

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
      ElMessage.error(getRequestErrorDisplayMessage(error, '编辑并发送失败'))
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
    if (!activeRun.value) {
      return false
    }

    try {
      handleMutationResponse(await cancelChatRun(activeRun.value.runId))
      return true
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '停止生成失败'))
      return false
    }
  }

  function handleMutationResponse(response: ChatMutationResponse): void {
    replaceActiveSession(response.session)
    activeRun.value = response.run ?? response.session.activeRun ?? null
    latestSequenceBySession.set(response.session.id, response.latestSequence)

    if (response.run) {
      startSessionEventStream(response.session.id, response.latestSequence)
    }

    void refreshSessionList()
  }

  function startSessionEventStream(sessionId: string, afterSequence: number | null): void {
    if (eventSessionId === sessionId && eventController) {
      return
    }

    stopSessionEventStream()
    eventSessionId = sessionId
    eventController = new AbortController()

    void streamChatSessionEvents(
      sessionId,
      afterSequence,
      event => void handleSessionEvent(event),
      { signal: eventController.signal },
    ).catch((error) => {
      if (!isAbortError(error)) {
        ElMessage.error(getRequestErrorDisplayMessage(error, '聊天事件订阅已断开'))
      }
    }).finally(() => {
      if (eventSessionId === sessionId) {
        eventController = null
        eventSessionId = null
      }
    })
  }

  function stopSessionEventStream(): void {
    eventController?.abort()
    eventController = null
    eventSessionId = null
  }

  async function handleSessionEvent(event: ChatSessionEvent): Promise<void> {
    const currentCursor = latestSequenceBySession.get(event.sessionId) ?? 0
    if (event.sequence <= currentCursor && event.type !== CHAT_SESSION_EVENT_TYPE.SNAPSHOT_REQUIRED) {
      return
    }

    latestSequenceBySession.set(event.sessionId, event.sequence)

    if (event.type === CHAT_SESSION_EVENT_TYPE.SNAPSHOT_REQUIRED) {
      latestSequenceBySession.set(event.sessionId, event.payload.latestSequence)
      await refreshActiveSession(event.sessionId)
      return
    }

    if (event.type === CHAT_SESSION_EVENT_TYPE.BRANCH_SWITCHED || event.type === CHAT_SESSION_EVENT_TYPE.MESSAGE_CREATED) {
      await refreshActiveSession(event.sessionId)
      return
    }

    if (activeSession.value?.id === event.sessionId) {
      activeSession.value = {
        ...activeSession.value,
        messages: applyChatSessionEventToMessages(activeSession.value.messages, event),
      }
    }

    if (
      event.type === CHAT_SESSION_EVENT_TYPE.RUN_COMPLETED
      || event.type === CHAT_SESSION_EVENT_TYPE.RUN_FAILED
      || event.type === CHAT_SESSION_EVENT_TYPE.RUN_CANCELLED
    ) {
      activeRun.value = null
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

  function shouldSubscribeSessionEvents(sessionId: string): boolean {
    return activeSession.value?.id === sessionId
      && activeSession.value.messages.some(message =>
        message.status === CHAT_MESSAGE_STATUS.PENDING
        || message.status === CHAT_MESSAGE_STATUS.STREAMING,
      )
  }

  return {
    activeRun,
    cancelActiveRun,
    editAndSendMessage,
    isStreaming,
    retryMessage,
    sendMessage,
    switchBranch,
  }
})

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
