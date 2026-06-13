import type { ChatApi } from './createChatApi'
import type { ChatSessionEvent } from '@/apis/chat'
import { translate } from '@/i18n'
import { ElMessage } from '@/utils/element-plus'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

export function createChatSessionEvents(api: ChatApi) {
  let eventController: AbortController | null = null
  let eventSessionId: string | null = null
  let eventAfterSequence: number | null = null
  let eventHandler: ((event: ChatSessionEvent) => void | Promise<void>) | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  function startSessionEventStream(
    sessionId: string,
    afterSequence: number | null,
    onEvent: (event: ChatSessionEvent) => void | Promise<void>,
  ): void {
    if (eventSessionId === sessionId && eventController && eventAfterSequence === afterSequence) {
      return
    }

    stopSessionEventStream()
    eventHandler = onEvent
    openSessionEventStream(sessionId, afterSequence)
  }

  function openSessionEventStream(
    sessionId: string,
    afterSequence: number | null,
  ): void {
    clearReconnectTimer()
    eventSessionId = sessionId
    eventAfterSequence = afterSequence
    const controller = new AbortController()
    eventController = controller

    void api.streamEvents(
      sessionId,
      afterSequence,
      async (event) => {
        eventAfterSequence = event.sequence
        await eventHandler?.(event)
      },
      { signal: controller.signal },
    ).catch((error) => {
      if (isAbortError(error)) {
        return
      }

      if (eventSessionId === sessionId && eventController === controller) {
        scheduleReconnect()
      }
      else {
        ElMessage.error(getRequestErrorDisplayMessage(error, translate('chat.errors.loadEvents')))
      }
    }).finally(() => {
      if (eventSessionId === sessionId && eventController === controller) {
        eventController = null
      }
    })
  }

  function stopSessionEventStream(sessionId?: string): void {
    if (sessionId && eventSessionId !== sessionId) {
      return
    }

    eventController?.abort()
    clearReconnectTimer()
    eventController = null
    eventSessionId = null
    eventAfterSequence = null
    eventHandler = null
  }

  function scheduleReconnect(): void {
    clearReconnectTimer()

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null

      if (!eventSessionId || !eventHandler) {
        return
      }

      openSessionEventStream(eventSessionId, eventAfterSequence)
    }, 1000)
  }

  function clearReconnectTimer(): void {
    if (!reconnectTimer) {
      return
    }

    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  return {
    startSessionEventStream,
    stopSessionEventStream,
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export type ChatSessionEvents = ReturnType<typeof createChatSessionEvents>
