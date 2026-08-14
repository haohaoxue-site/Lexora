import type {
  Api,
  AssistantMessage,
  ImageContent,
  Model,
  UserMessage,
} from '@earendil-works/pi-ai'
import type { MessageRecord } from '../storage/conversationRepository'
import { readBuddyInterruptedMessageContent } from '../../../shared/buddyMessageContent'

export interface CreateBuddyRecoveryMessagesOptions {
  fallbackModel: Model<Api>
  messages: readonly MessageRecord[]
  resolveRunModel: (runId: string) => Model<Api> | null
  resolveUserInput: (messageId: string) => {
    images: readonly ImageContent[]
    prompt: string
  } | null
  triggeringMessageId: string | null
}

export function createBuddyRecoveryMessages(
  options: CreateBuddyRecoveryMessagesOptions,
): Array<AssistantMessage | UserMessage> {
  const triggerIndex = options.triggeringMessageId === null
    ? options.messages.length
    : options.messages.findIndex(message => message.id === options.triggeringMessageId)
  if (triggerIndex < 0)
    return []

  const recovered: Array<AssistantMessage | UserMessage> = []
  for (const message of options.messages.slice(0, triggerIndex)) {
    const text = readMessageText(message.content, message.role === 'user')
    const timestamp = Date.parse(message.createdAt)
    if (message.role === 'user') {
      const input = options.resolveUserInput(message.id)
      const prompt = input?.prompt.trim() || text
      if (!prompt && !input?.images.length)
        continue
      recovered.push({
        content: input?.images.length
          ? [{ text: prompt, type: 'text' }, ...input.images]
          : prompt,
        role: 'user',
        timestamp,
      })
      continue
    }
    if (!text)
      continue
    if (message.role !== 'assistant')
      continue
    const model = message.runId
      ? options.resolveRunModel(message.runId) ?? options.fallbackModel
      : options.fallbackModel
    recovered.push({
      api: model.api,
      content: [{ text, type: 'text' }],
      model: model.id,
      provider: model.provider,
      role: 'assistant',
      stopReason: readBuddyInterruptedMessageContent(message.content) ? 'aborted' : 'stop',
      timestamp,
      usage: {
        cacheRead: 0,
        cacheWrite: 0,
        cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0 },
        input: 0,
        output: 0,
        totalTokens: 0,
      },
    })
  }
  return recovered
}

function readMessageText(content: unknown, preferModelInput: boolean): string {
  if (typeof content === 'string')
    return content.trim()
  if (!content || typeof content !== 'object' || Array.isArray(content))
    return ''
  const record = content as Record<string, unknown>
  const value = preferModelInput && typeof record.modelInputText === 'string'
    ? record.modelInputText
    : record.text
  return typeof value === 'string' ? value.trim() : ''
}
