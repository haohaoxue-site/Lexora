import type { AgentChatContextMessage, AgentRunModelTarget } from '@haohaoxue/samepage-contracts'
import { Annotation } from '@langchain/langgraph'

export const ChatReplyState = Annotation.Root({
  messages: Annotation<AgentChatContextMessage[]>(),
  responseText: Annotation<string>(),
})

export interface ChatReplyGraphContext {
  modelTarget?: AgentRunModelTarget | null
  onTextDelta?: (text: string) => Promise<void> | void
}
