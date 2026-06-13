import type {
  AgentChatContextMessage,
  AgentChatContextSnapshot,
  AgentContextPolicy,
  AgentMemoryRetrievalSnapshot,
  AgentProfileConfig,
  AgentRuntimeModelTarget,
  AgentRuntimeSkillContext,
  ChatGenerationUsageSnapshot,
  ChatMemoryOperationProjection,
  ResolvedLanguagePreference,
} from '@haohaoxue/samepage-contracts'
import type { AgentChatModelOptions } from '../integrations/model-providers/chat-model'
import type { AgentModelStreamPart } from '../integrations/model-providers/stream-text'
import type { AgentContextBudget, AgentModelLimits } from './context/budget'
import type { AgentHistoryDigest } from './context/history-compaction'
import type { FocusedTranslatorInvocation } from './skills/builtin/translator'
import { Annotation } from '@langchain/langgraph'

export const AgentGraphState = Annotation.Root({
  sessionId: Annotation<string>(),
  sessionHistoryVersion: Annotation<number>(),
  activePathKey: Annotation<string>(),
  activePathTailMessageId: Annotation<string>(),
  olderMessagesExcerpt: Annotation<string>(),
  historyDigest: Annotation<AgentHistoryDigest | null>(),
  memoryRetrieval: Annotation<AgentMemoryRetrievalSnapshot | null>(),
  messages: Annotation<AgentChatContextMessage[], AgentChatContextMessage[]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
  contextBudget: Annotation<AgentContextBudget | null>(),
  usageSnapshot: Annotation<ChatGenerationUsageSnapshot | null>(),
  responseText: Annotation<string>(),
  memoryOperations: Annotation<ChatMemoryOperationProjection[], ChatMemoryOperationProjection[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
})

export interface AgentGraphContext {
  generationId?: string | null
  actorUserId?: string | null
  agentProfileId?: string | null
  modelTarget?: AgentRuntimeModelTarget | null
  modelOptions?: AgentChatModelOptions | null
  modelLimits?: AgentModelLimits | null
  agentProfileConfig?: AgentProfileConfig | null
  skillContext?: AgentRuntimeSkillContext | null
  contextPolicy?: AgentContextPolicy | null
  contextBudget?: AgentContextBudget | null
  defaultResponseLanguage?: ResolvedLanguagePreference | null
  memoryIgnoredForRun?: boolean
  focusedTranslatorInvocation?: FocusedTranslatorInvocation | null
  triggerUserMessageId?: string | null
  contextSnapshots?: AgentChatContextSnapshot[] | null
  onStreamPart?: (part: AgentModelStreamPart) => Promise<void> | void
}
