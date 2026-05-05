import type {
  ChatModelListResponse,
  ChatModelSelection,
  ChatRuntimeConfig,
  ChatSessionDetail,
  ChatSessionSummary,
} from './typing'
import { SERVER_PATH } from '@haohaoxue/samepage-contracts'
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

export async function streamChatCompletion(
  sessionId: string,
  modelRef: ChatModelSelection['modelRef'] | null | undefined,
  content: string,
  onChunk: (content: string) => void,
): Promise<void> {
  const authStore = useAuthStore()

  const response = await fetch(`${API_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authStore.accessToken}`,
    },
    body: JSON.stringify({
      sessionId,
      content,
      modelRef: modelRef ?? undefined,
    }),
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
      if (done)
        break

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: '))
          continue

        const data = trimmed.slice(6)
        if (data === '[DONE]') {
          return
        }

        let parsed: { content?: string, error?: string } | null = null
        try {
          parsed = JSON.parse(data) as { content?: string, error?: string }
        }
        catch {
          continue
        }

        if (parsed.error) {
          throw createRequestError({
            source: 'stream',
            data: {
              message: parsed.error,
            },
          })
        }

        if (parsed.content) {
          onChunk(parsed.content)
        }
      }
    }
  }
  catch (error) {
    throw toRequestError(error, {
      source: 'stream',
    })
  }
}

async function readApiError(response: Response) {
  return createRequestErrorFromHttpResponse(response, {
    source: 'stream',
  })
}
