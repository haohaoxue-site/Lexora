import type { AgentChatContextMessage, AgentRunModelTarget } from '@haohaoxue/samepage-contracts'
import type { AgentModelStreamPart } from '../../integrations/model-providers/stream-text'
import { Annotation } from '@langchain/langgraph'

export const ChatReplyState = Annotation.Root({
  messages: Annotation<AgentChatContextMessage[]>(),
  responseText: Annotation<string>(),
})

export interface ChatReplyGraphContext {
  modelTarget?: AgentRunModelTarget | null
  onStreamPart?: (part: AgentModelStreamPart) => Promise<void> | void
}
