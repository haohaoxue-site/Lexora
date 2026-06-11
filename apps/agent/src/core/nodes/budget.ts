import type {
  AgentChatContextMessage,
  AgentMemoryRetrievalSnapshot,
} from '@haohaoxue/samepage-contracts'
import type { AgentHistoryDigest } from '../context/history-compaction'
import type { AgentGraphContext } from '../state'
import { resolveAgentContextBudget } from '../context/budget'
import { createAgentSystemPrompt } from '../prompts/system'
import { createAgentMemoryPromptBlock } from '../skills/builtin/memory'
import { createFocusedTranslatorSystemPrompt } from '../skills/builtin/translator'

export interface AgentBudgetState {
  olderMessagesExcerpt: string
  historyDigest: AgentHistoryDigest | null
  memoryRetrieval: AgentMemoryRetrievalSnapshot | null
  messages: AgentChatContextMessage[]
}

export function resolveBudgetForState(
  state: AgentBudgetState,
  context: AgentGraphContext | undefined,
) {
  if (context?.focusedTranslatorInvocation) {
    return resolveAgentContextBudget({
      model: context.modelLimits ?? {},
      modelPolicy: context.agentProfileConfig?.modelPolicy,
      systemPrompt: createFocusedTranslatorSystemPrompt(context.focusedTranslatorInvocation),
      contextSnapshots: [],
      memoryPrompt: null,
      historyDigest: null,
      recentMessages: state.messages,
    })
  }

  return resolveAgentContextBudget({
    model: context?.modelLimits ?? {},
    modelPolicy: context?.agentProfileConfig?.modelPolicy,
    systemPrompt: createAgentSystemPrompt({
      agentProfileConfig: context?.agentProfileConfig,
      skillContext: context?.skillContext,
    }),
    contextSnapshots: context?.contextSnapshots ?? [],
    memoryPrompt: createAgentMemoryPromptBlock(state.memoryRetrieval),
    historyDigest: state.historyDigest ?? (state.olderMessagesExcerpt
      ? { summary: state.olderMessagesExcerpt }
      : null),
    recentMessages: state.messages,
  })
}
