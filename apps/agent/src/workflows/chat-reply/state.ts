import type { AgentChatContextMessage, AgentRunModelTarget } from '@haohaoxue/samepage-contracts'
import type { AgentModelStreamPart } from '../../integrations/model-providers/stream-text'
import { Annotation } from '@langchain/langgraph'

export const ChatReplyState = Annotation.Root({
  sessionId: Annotation<string>(),
  sessionHistoryVersion: Annotation<number>(),
  activePathKey: Annotation<string>(),
  activePathTailMessageId: Annotation<string>(),
  olderMessagesExcerpt: Annotation<string>(),
  messages: Annotation<AgentChatContextMessage[], AgentChatContextMessage[]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
  responseText: Annotation<string>(),
})

export interface ChatReplyGraphContext {
  modelTarget?: AgentRunModelTarget | null
  onStreamPart?: (part: AgentModelStreamPart) => Promise<void> | void
}
