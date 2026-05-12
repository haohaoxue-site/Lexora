import type {
  ChatModelListResponse,
  ChatModelSelection,
  ChatMutationResponse,
  ChatRuntimeConfig,
  ChatSessionDetail,
  ChatSessionEvent,
  ChatSessionSummary,
  CreateChatSessionMessageRequest,
  EditAndSendChatMessageRequest,
  SwitchChatActiveMessageRequest,
  UpdateChatSessionTitleRequest,
} from './typing'
import { ChatSessionEventSchema, SERVER_PATH } from '@haohaoxue/samepage-contracts'
import { useAuthStore } from '@/stores/auth'
import { axios } from '@/utils/axios'
import { createRequestError, createRequestErrorFromHttpResponse, toRequestError } from '@/utils/request-error'

export * from './typing'

const API_BASE_URL = SERVER_PATH

export function getChatSessions(): Promise<ChatSessionSummary[]> {
  return axios.request({
    method: 'get',
    url: '/chat/sessions',
  })
}

export function createChatSession(): Promise<ChatSessionDetail> {
  return axios.request({
    method: 'post',
    url: '/chat/sessions',
  })
}

export function getChatSession(sessionId: string): Promise<ChatSessionDetail> {
  return axios.request({
    method: 'get',
    url: `/chat/sessions/${sessionId}`,
  })
}

export function deleteChatSession(sessionId: string): Promise<null> {
  return axios.request({
    method: 'delete',
    url: `/chat/sessions/${sessionId}`,
  })
}

export function updateChatSessionModel(
  sessionId: string,
  data: ChatModelSelection,
): Promise<ChatSessionDetail> {
  return axios.request({
    method: 'patch',
    url: `/chat/sessions/${sessionId}/model`,
    data,
  })
}

export function updateChatSessionTitle(
  sessionId: string,
  data: UpdateChatSessionTitleRequest,
): Promise<ChatSessionDetail> {
  return axios.request({
    method: 'patch',
    url: `/chat/sessions/${sessionId}/title`,
    data,
  })
}

export function sendChatSessionMessage(
  sessionId: string,
  data: CreateChatSessionMessageRequest,
): Promise<ChatMutationResponse> {
  return axios.request({
    method: 'post',
    url: `/chat/sessions/${sessionId}/messages`,
    data,
  })
}

export function editAndSendChatMessage(
  sessionId: string,
  messageId: string,
  data: EditAndSendChatMessageRequest,
): Promise<ChatMutationResponse> {
  return axios.request({
    method: 'post',
    url: `/chat/sessions/${sessionId}/messages/${messageId}/edit-and-send`,
    data,
  })
}

export function retryChatAssistantMessage(
  sessionId: string,
  messageId: string,
): Promise<ChatMutationResponse> {
  return axios.request({
    method: 'post',
    url: `/chat/sessions/${sessionId}/messages/${messageId}/retry`,
  })
}

export function switchChatActiveMessage(
  sessionId: string,
  data: SwitchChatActiveMessageRequest,
): Promise<ChatMutationResponse> {
  return axios.request({
    method: 'patch',
    url: `/chat/sessions/${sessionId}/active-message`,
    data,
  })
}

export function cancelChatRun(runId: string): Promise<ChatMutationResponse> {
  return axios.request({
    method: 'post',
    url: `/chat/runs/${runId}/cancel`,
  })
}

export function getChatRuntimeConfig(): Promise<ChatRuntimeConfig> {
  return axios.request({
    method: 'get',
    url: '/chat/config',
  })
}

export function getChatModels(): Promise<ChatModelListResponse> {
  return axios.request({
    method: 'get',
    url: '/chat/models',
  })
}

export async function streamChatSessionEvents(
  sessionId: string,
  afterSequence: number | null,
  onEvent: (event: ChatSessionEvent) => void | Promise<void>,
  options: {
    signal?: AbortSignal
  } = {},
): Promise<void> {
  const authStore = useAuthStore()
  const query = afterSequence !== null
    ? `?afterSequence=${encodeURIComponent(String(afterSequence))}`
    : ''

  const response = await fetch(`${API_BASE_URL}/chat/sessions/${sessionId}/events${query}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${authStore.accessToken}`,
    },
    signal: options.signal,
  })

  if (!response.ok) {
    throw await readApiError(response)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw createRequestError({
      source: 'stream',
      message: 'no response body',
    })
  }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) {
          continue
        }

        let payload: unknown = null
        try {
          payload = JSON.parse(trimmed.slice(6))
        }
        catch {
          continue
        }

        const parsedEvent = ChatSessionEventSchema.safeParse(payload)
        if (parsedEvent.success) {
          await onEvent(parsedEvent.data)
        }
      }
    }
  }
  catch (error) {
    if (options.signal?.aborted) {
      throw error
    }

    throw toRequestError(error, {
      source: 'stream',
    })
  }
  finally {
    reader.releaseLock()
  }
}

async function readApiError(response: Response) {
  return createRequestErrorFromHttpResponse(response, {
    source: 'stream',
  })
}
