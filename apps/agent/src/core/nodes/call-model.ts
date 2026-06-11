import type {
  AgentChatContextMessage,
  AgentMemoryRetrievalSnapshot,
} from '@haohaoxue/samepage-contracts'
import type { GraphNode } from '@langchain/langgraph'
import type { AgentMemoryApiClient } from '../../clients/memory'
import type { AgentSkillApiClient } from '../../clients/skills'
import type {
  AgentChatModelFactory,
} from '../../integrations/model-providers/chat-model'
import type { AgentGraphContext, AgentGraphState } from '../state'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { applyAgentContextSnapshotsToMessages } from '../context/snapshots'
import { toLangChainChatMessages } from '../messages/langchain'
import { createAgentSystemPrompt } from '../prompts/system'
import { createAgentMemoryPromptBlock } from '../skills/builtin/memory'
import {
  createFocusedTranslatorHumanContent,
  createFocusedTranslatorSystemPrompt,
} from '../skills/builtin/translator'
import { callModelWithRuntimeTools } from '../tools'
import { createChatGenerationUsageSnapshot } from '../usage/snapshot'

export interface CreateCallModelNodeOptions {
  chatModelFactory: AgentChatModelFactory
  memoryApi?: AgentMemoryApiClient
  skillApi?: AgentSkillApiClient
}

export function createCallModelNode(options: CreateCallModelNodeOptions): GraphNode<typeof AgentGraphState, AgentGraphContext> {
  return async (state, config) => {
    const modelTarget = config.context?.modelTarget ?? config.configurable?.modelTarget ?? null

    if (!modelTarget) {
      throw new Error('Agent generation 缺少模型运行目标')
    }

    const modelOptions = config.context?.modelOptions ?? null
    const model = modelOptions
      ? options.chatModelFactory.createChatModel(modelTarget, modelOptions)
      : options.chatModelFactory.createChatModel(modelTarget)
    const focusedTranslatorInvocation = config.context?.focusedTranslatorInvocation ?? null
    const langChainMessages = focusedTranslatorInvocation
      ? toFocusedTranslatorMessages(
          state.messages,
          focusedTranslatorInvocation,
          config.context?.triggerUserMessageId,
        )
      : toLangChainMessages(
          applyAgentContextSnapshotsToMessages(state.messages, {
            triggerUserMessageId: config.context?.triggerUserMessageId,
            contextSnapshots: config.context?.contextSnapshots,
          }),
          state.olderMessagesExcerpt,
          state.historyDigest?.summary ?? null,
          config.context?.agentProfileConfig,
          config.context?.skillContext,
          state.memoryRetrieval,
        )

    const streamResult = await callModelWithRuntimeTools({
      model,
      messages: langChainMessages,
      sessionId: state.sessionId,
      context: config.context,
      memoryApi: focusedTranslatorInvocation ? undefined : options.memoryApi,
      skillApi: focusedTranslatorInvocation ? undefined : options.skillApi,
      signal: config.signal,
    })
    const usageSnapshot = createChatGenerationUsageSnapshot({
      inputMessages: langChainMessages,
      outputText: streamResult.text,
      providerUsage: streamResult.providerUsage,
      contextBudget: config.context?.contextBudget ?? state.contextBudget,
      memoryRetrieval: focusedTranslatorInvocation ? null : state.memoryRetrieval,
      firstTokenLatencyMs: streamResult.firstTokenLatencyMs,
      elapsedMs: streamResult.elapsedMs,
    })

    return {
      responseText: streamResult.text,
      usageSnapshot,
      memoryOperations: streamResult.memoryOperations,
      messages: [
        {
          id: state.activePathTailMessageId,
          role: 'assistant',
          content: streamResult.text,
        },
      ],
    }
  }
}

function toFocusedTranslatorMessages(
  messages: AgentChatContextMessage[],
  invocation: NonNullable<AgentGraphContext['focusedTranslatorInvocation']>,
  triggerUserMessageId: string | null | undefined,
) {
  const triggerMessage = triggerUserMessageId
    ? messages.find(message => message.id === triggerUserMessageId && message.role === 'user')
    : null
  const sourceMessage = triggerMessage ?? messages.findLast(message => message.role === 'user') ?? messages.at(-1)

  if (!sourceMessage) {
    throw new Error('翻译技能缺少用户正文')
  }

  return [
    new SystemMessage(createFocusedTranslatorSystemPrompt(invocation)),
    new HumanMessage({
      id: sourceMessage.id,
      content: createFocusedTranslatorHumanContent(sourceMessage),
    }),
  ]
}

function toLangChainMessages(
  messages: AgentChatContextMessage[],
  olderMessagesExcerpt: string,
  historyDigestSummary: string | null,
  agentProfileConfig: AgentGraphContext['agentProfileConfig'],
  skillContext: AgentGraphContext['skillContext'],
  memoryRetrieval: AgentMemoryRetrievalSnapshot | null,
) {
  const memoryPrompt = createAgentMemoryPromptBlock(memoryRetrieval)
  const systemPrompt = createAgentSystemPrompt({
    agentProfileConfig,
    skillContext,
    historyDigestSummary: historyDigestSummary ?? undefined,
    olderMessagesExcerpt,
  })
  return [
    new SystemMessage(memoryPrompt ? `${systemPrompt}\n\n${memoryPrompt}` : systemPrompt),
    ...toLangChainChatMessages(messages),
  ]
}
