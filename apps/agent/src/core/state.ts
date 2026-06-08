import type {
  AgentChatContextMessage,
  AgentChatContextSnapshot,
  AgentContextPolicy,
  AgentProfileConfig,
  AgentRuntimeModelTarget,
} from '@haohaoxue/samepage-contracts'
import type { AgentChatModelOptions } from '../integrations/model-providers/chat-model'
import type { AgentModelStreamPart } from '../integrations/model-providers/stream-text'
import { Annotation } from '@langchain/langgraph'

export const AgentGraphState = Annotation.Root({
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

export interface AgentGraphContext {
  modelTarget?: AgentRuntimeModelTarget | null
  modelOptions?: AgentChatModelOptions | null
  agentProfileConfig?: AgentProfileConfig | null
  contextPolicy?: AgentContextPolicy | null
  triggerUserMessageId?: string | null
  contextSnapshots?: AgentChatContextSnapshot[] | null
  onStreamPart?: (part: AgentModelStreamPart) => Promise<void> | void
}
