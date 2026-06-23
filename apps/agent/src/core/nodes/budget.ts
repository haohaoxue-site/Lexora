import type {
  AgentChatContextMessage,
  AgentMemoryRetrievalSnapshot,
} from '@haohaoxue/lexora-contracts'
import type { AgentHistoryDigest } from '../context/history-compaction'
import type { AgentGraphContext } from '../state'
import { resolveAgentContextBudget } from '../context/budget'
import { createAgentSystemPrompt } from '../prompts/system'
import { isLocationSkillActive } from '../skills/action-providers/builtin/location'
import { createAgentMemoryPromptBlock } from '../skills/action-providers/builtin/memory'
import { isTimeSkillActive } from '../skills/action-providers/builtin/time'
import { createDirectDocumentAssistantSystemPrompt } from '../skills/direct-invocations/document-assistant'
import { createDirectTranslatorSystemPrompt } from '../skills/direct-invocations/translator'

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
  if (context?.directTranslatorInvocation) {
    return resolveAgentContextBudget({
      model: context.modelLimits ?? {},
      modelPolicy: context.agentProfileConfig?.modelPolicy,
      systemPrompt: createDirectTranslatorSystemPrompt(context.directTranslatorInvocation),
      contextSnapshots: [],
      memoryPrompt: null,
      historyDigest: null,
      recentMessages: state.messages,
    })
  }

  if (context?.directDocumentAssistantInvocation) {
    return resolveAgentContextBudget({
      model: context.modelLimits ?? {},
      modelPolicy: context.agentProfileConfig?.modelPolicy,
      systemPrompt: createDirectDocumentAssistantSystemPrompt(context.directDocumentAssistantInvocation),
      contextSnapshots: context.contextSnapshots ?? [],
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
      defaultResponseLanguage: context?.defaultResponseLanguage ?? undefined,
      timeSkillActive: isTimeSkillActive(context),
      locationSkillActive: isLocationSkillActive(context),
    }),
    contextSnapshots: context?.contextSnapshots ?? [],
    memoryPrompt: createAgentMemoryPromptBlock(state.memoryRetrieval),
    historyDigest: state.historyDigest ?? (state.olderMessagesExcerpt
      ? { summary: state.olderMessagesExcerpt }
      : null),
    recentMessages: state.messages,
  })
}
