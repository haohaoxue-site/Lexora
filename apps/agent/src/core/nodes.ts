import type {
  AgentChatContextMessage,
  AgentMemoryPolicy,
  AgentMemoryRetrievalSnapshot,
} from '@haohaoxue/samepage-contracts'
import type { GraphNode } from '@langchain/langgraph'
import type { AgentMemoryApiClient } from '../clients/memory'
import type { AgentChatModelFactory } from '../integrations/model-providers/chat-model'
import type { AgentHistoryDigest } from './history-compaction'
import type { AgentGraphContext, AgentGraphState } from './state'
import { AgentMemoryRetrievalSnapshotSchema } from '@haohaoxue/samepage-contracts'
import { SystemMessage } from '@langchain/core/messages'
import { Overwrite } from '@langchain/langgraph'
import { consumeChatModelTextStream } from '../integrations/model-providers/stream-text'
import { resolveAgentContextBudget } from './context-budget'
import { applyAgentContextSnapshotsToMessages } from './context-window'
import { compactAgentHistory } from './history-compaction'
import { createAgentMemoryPromptBlock } from './memory-prompt'
import { toLangChainChatMessages } from './message-conversion'
import { createAgentSystemPrompt } from './prompt'
import { createChatGenerationUsageSnapshot } from './usage'

export interface CreateCallModelNodeOptions {
  chatModelFactory: AgentChatModelFactory
}

export interface CreateRetrieveMemoryNodeOptions {
  memoryApi?: AgentMemoryApiClient
}

interface AgentBudgetState {
  olderMessagesExcerpt: string
  historyDigest: AgentHistoryDigest | null
  memoryRetrieval: AgentMemoryRetrievalSnapshot | null
  messages: AgentChatContextMessage[]
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
    const modelMessages = applyAgentContextSnapshotsToMessages(state.messages, {
      triggerUserMessageId: config.context?.triggerUserMessageId,
      contextSnapshots: config.context?.contextSnapshots,
    })
    const langChainMessages = toLangChainMessages(
      modelMessages,
      state.olderMessagesExcerpt,
      state.historyDigest?.summary ?? null,
      config.context?.agentProfileConfig,
      state.memoryRetrieval,
    )

    const stream = await model.stream(langChainMessages, {
      signal: config.signal,
    })

    const streamResult = await consumeChatModelTextStream(stream, {
      onStreamPart: config.context?.onStreamPart,
    })
    const usageSnapshot = createChatGenerationUsageSnapshot({
      inputMessages: langChainMessages,
      outputText: streamResult.text,
      providerUsage: streamResult.providerUsage,
      contextBudget: config.context?.contextBudget ?? state.contextBudget,
      memoryRetrieval: state.memoryRetrieval,
      firstTokenLatencyMs: streamResult.firstTokenLatencyMs,
      elapsedMs: streamResult.elapsedMs,
    })

    return {
      responseText: streamResult.text,
      usageSnapshot,
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

export function createRetrieveMemoryNode(options: CreateRetrieveMemoryNodeOptions): GraphNode<typeof AgentGraphState, AgentGraphContext> {
  return async (state, config) => {
    const memoryApi = options.memoryApi
    const profileConfig = config.context?.agentProfileConfig
    const generationId = config.context?.generationId
    const actorUserId = config.context?.actorUserId

    if (!memoryApi || !profileConfig || !generationId || !actorUserId) {
      return {}
    }

    const policy = {
      ...profileConfig.memoryPolicy,
      ignoredForRun: profileConfig.memoryPolicy.ignoredForRun || Boolean(config.context?.memoryIgnoredForRun),
    }
    const query = resolveMemoryQuery(state, config.context?.triggerUserMessageId)

    try {
      const response = await memoryApi.retrieveMemories({
        actorUserId,
        agentProfileId: config.context?.agentProfileId ?? null,
        generationId,
        sessionId: state.sessionId,
        query,
        policy,
      })

      return {
        memoryRetrieval: response.snapshot,
      }
    }
    catch {
      return {
        memoryRetrieval: createRuntimeMemoryFallbackSnapshot(policy, query),
      }
    }
  }
}

export function createPrepareContextNode(): GraphNode<typeof AgentGraphState, AgentGraphContext> {
  return async (state, config) => {
    return {
      contextBudget: resolveBudgetForState(state, config.context),
    }
  }
}

export function createCompactHistoryNode(): GraphNode<typeof AgentGraphState, AgentGraphContext> {
  return async (state, config) => {
    const contextBudget = config.context?.contextBudget ?? state.contextBudget
    const triggerUserMessageId = config.context?.triggerUserMessageId

    if (!contextBudget || !triggerUserMessageId) {
      return {}
    }

    const result = await compactAgentHistory({
      sessionHistoryVersion: state.sessionHistoryVersion,
      triggerUserMessageId,
      messages: state.messages,
      budget: contextBudget,
      historyDigest: state.historyDigest,
    })
    const nextContextBudget = resolveBudgetForState({
      ...state,
      messages: result.messages,
      historyDigest: result.historyDigest,
    }, config.context)

    return {
      messages: new Overwrite(result.messages),
      historyDigest: result.historyDigest,
      contextBudget: nextContextBudget,
    }
  }
}

function resolveBudgetForState(
  state: AgentBudgetState,
  context: AgentGraphContext | undefined,
) {
  return resolveAgentContextBudget({
    model: context?.modelLimits ?? {},
    modelPolicy: context?.agentProfileConfig?.modelPolicy,
    systemPrompt: createAgentSystemPrompt({
      agentProfileConfig: context?.agentProfileConfig,
    }),
    contextSnapshots: context?.contextSnapshots ?? [],
    memoryPrompt: createAgentMemoryPromptBlock(state.memoryRetrieval),
    historyDigest: state.historyDigest ?? (state.olderMessagesExcerpt
      ? { summary: state.olderMessagesExcerpt }
      : null),
    recentMessages: state.messages,
  })
}

function toLangChainMessages(
  messages: AgentChatContextMessage[],
  olderMessagesExcerpt: string,
  historyDigestSummary: string | null,
  agentProfileConfig: AgentGraphContext['agentProfileConfig'],
  memoryRetrieval: AgentMemoryRetrievalSnapshot | null,
) {
  const memoryPrompt = createAgentMemoryPromptBlock(memoryRetrieval)
  const systemPrompt = createAgentSystemPrompt({
    agentProfileConfig,
    historyDigestSummary: historyDigestSummary ?? undefined,
    olderMessagesExcerpt,
  })
  return [
    new SystemMessage(memoryPrompt ? `${systemPrompt}\n\n${memoryPrompt}` : systemPrompt),
    ...toLangChainChatMessages(messages),
  ]
}

function resolveMemoryQuery(state: AgentBudgetState, triggerUserMessageId: string | null | undefined): string {
  const triggerMessage = triggerUserMessageId
    ? state.messages.find(message => message.id === triggerUserMessageId)
    : null

  return (triggerMessage ?? state.messages.at(-1))?.content ?? ''
}

function createRuntimeMemoryFallbackSnapshot(policy: AgentMemoryPolicy, query: string): AgentMemoryRetrievalSnapshot {
  return AgentMemoryRetrievalSnapshotSchema.parse({
    enabled: policy.enabled,
    ignoredForRun: policy.ignoredForRun,
    query,
    scopes: policy.scopes,
    lanes: policy.lanes,
    selectedMemoryIds: [],
    omittedMemoryIds: [],
    injectedCount: 0,
    estimatedTokens: 0,
    budgetTokens: policy.maxInjectedTokens,
    retriever: 'disabled',
    renderedSections: [],
    createdAt: new Date().toISOString(),
  })
}
