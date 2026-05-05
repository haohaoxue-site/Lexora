import type { AiEditorStreamEvent, CreateAiEditorSessionRequest } from '@/apis/ai'
import { AI_EDITOR_STREAM_EVENT_TYPE, AiEditorStreamEventSchema } from '@haohaoxue/samepage-contracts'
import { createAiEditorSession } from '@/apis/ai'
import { createRequestError, createRequestErrorFromHttpResponse, toRequestError } from '@/utils/request-error'
import { EDITOR_AI_STREAM_DONE_PAYLOAD, EDITOR_AI_STREAM_ERROR_MESSAGE } from './contracts'

export async function streamEditorAiSession(
  data: CreateAiEditorSessionRequest,
  onEvent: (event: AiEditorStreamEvent) => void,
  options: {
    signal?: AbortSignal
  } = {},
): Promise<void> {
  const response = await createAiEditorSession(data, {
    signal: options.signal,
  })

  if (!response.ok) {
    throw await createRequestErrorFromHttpResponse(response, {
      source: 'stream',
    })
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw createRequestError({
      source: 'stream',
      message: EDITOR_AI_STREAM_ERROR_MESSAGE.NO_RESPONSE_BODY,
    })
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let completed = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        assertCompletedEditorAiStream(completed)
        return
      }

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) {
          continue
        }

        const payload = trimmed.slice(6)
        if (payload === EDITOR_AI_STREAM_DONE_PAYLOAD) {
          assertCompletedEditorAiStream(completed)
          return
        }

        const event = parseEditorAiStreamEvent(payload)

        if (event.type === AI_EDITOR_STREAM_EVENT_TYPE.ERROR) {
          throw createRequestError({
            source: 'stream',
            data: {
              message: event.message,
            },
          })
        }

        if (event.type === AI_EDITOR_STREAM_EVENT_TYPE.CANDIDATE_COMPLETED) {
          completed = true
        }

        onEvent(event)
      }
    }
  }
  catch (error) {
    throw toRequestError(error, {
      source: 'stream',
    })
  }
}

function assertCompletedEditorAiStream(completed: boolean): void {
  if (completed) {
    return
  }

  throw createRequestError({
    source: 'stream',
    message: EDITOR_AI_STREAM_ERROR_MESSAGE.INCOMPLETE,
  })
}

function parseEditorAiStreamEvent(payload: string): AiEditorStreamEvent {
  try {
    return AiEditorStreamEventSchema.parse(JSON.parse(payload))
  }
  catch {
    throw createRequestError({
      source: 'stream',
      message: EDITOR_AI_STREAM_ERROR_MESSAGE.INVALID_EVENT,
    })
  }
}
