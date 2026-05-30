import type {
  BatchDeleteChatSessionsRequest,
  ChatModelSelection,
  ChatSessionEvent,
  ChatSessionOrigin,
  CreateChatSessionMessageRequest,
  EditAndSendChatMessageRequest,
  SwitchChatActiveMessageRequest,
  UpdateChatSessionTitleRequest,
} from '@/apis/chat'
import {
  batchDeleteChatSessions,
  cancelChatRun,
  createChatSession,
  deleteChatSession,
  editAndSendChatMessage,
  getChatSession,
  getChatSessions,
  retryChatAssistantMessage,
  sendChatSessionMessage,
  streamChatSessionEvents,
  switchChatActiveMessage,
  updateChatSessionModel,
  updateChatSessionTitle,
} from '@/apis/chat'

export function createChatApi(origin: ChatSessionOrigin) {
  return {
    origin,
    getSessions: () => getChatSessions({ origin }),
    createSession: () => createChatSession({ origin }),
    getSession: (sessionId: string) => getChatSession(sessionId, { origin }),
    deleteSession: (sessionId: string) => deleteChatSession(sessionId, { origin }),
    batchDeleteSessions: (data: BatchDeleteChatSessionsRequest) => batchDeleteChatSessions(data, { origin }),
    updateSessionModel: (sessionId: string, data: ChatModelSelection) => updateChatSessionModel(sessionId, data, { origin }),
    updateSessionTitle: (sessionId: string, data: UpdateChatSessionTitleRequest) => updateChatSessionTitle(sessionId, data, { origin }),
    sendMessage: (sessionId: string, data: CreateChatSessionMessageRequest) => sendChatSessionMessage(sessionId, data, { origin }),
    editAndSendMessage: (sessionId: string, messageId: string, data: EditAndSendChatMessageRequest) =>
      editAndSendChatMessage(sessionId, messageId, data, { origin }),
    retryAssistantMessage: (sessionId: string, messageId: string) => retryChatAssistantMessage(sessionId, messageId, { origin }),
    switchActiveMessage: (sessionId: string, data: SwitchChatActiveMessageRequest) => switchChatActiveMessage(sessionId, data, { origin }),
    cancelRun: (runId: string) => cancelChatRun(runId, { origin }),
    streamEvents: (
      sessionId: string,
      afterSequence: number | null,
      onEvent: (event: ChatSessionEvent) => void | Promise<void>,
      options: { signal?: AbortSignal } = {},
    ) => streamChatSessionEvents(sessionId, afterSequence, onEvent, { ...options, origin }),
  }
}

export type ChatApi = ReturnType<typeof createChatApi>
