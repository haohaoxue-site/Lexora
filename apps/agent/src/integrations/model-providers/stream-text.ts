import type { AgentChatModelResponse } from './chat-model'
import { readChatModelResponseText } from './response-text'

export interface ConsumeChatModelTextStreamOptions {
  onTextDelta?: (text: string) => Promise<void> | void
}

export async function consumeChatModelTextStream(
  stream: AsyncIterable<AgentChatModelResponse>,
  options: ConsumeChatModelTextStreamOptions = {},
): Promise<string> {
  let responseText = ''

  for await (const chunk of stream) {
    const text = readChatModelResponseText(chunk)
    if (!text) {
      continue
    }

    responseText += text
    await options.onTextDelta?.(text)
  }

  return responseText
}
