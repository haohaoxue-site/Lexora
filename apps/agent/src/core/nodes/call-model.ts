import type {
  AgentChatAttachmentContent,
  AgentChatContextMessage,
  AgentMemoryRetrievalSnapshot,
} from '@haohaoxue/lexora-contracts'
import type { GraphNode } from '@langchain/langgraph'
import type { AgentChatApiClient } from '../../clients/chat'
import type { AgentMemoryApiClient } from '../../clients/memory'
import type { AgentSkillApiClient } from '../../clients/skills'
import type {
  AgentChatModelFactory,
} from '../../integrations/model-providers/chat-model'
import type { WebSearchClient } from '../../integrations/web-search'
import type { RuntimeSkillActionProvider } from '../skills/adapters'
import type { AgentGraphContext, AgentGraphState } from '../state'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { applyAgentContextSnapshotsToMessages } from '../context/snapshots'
import { toLangChainChatMessages } from '../messages/langchain'
import { createAgentSystemPrompt } from '../prompts/system'
import { isLocationSkillActive } from '../skills/builtin/location'
import { createAgentMemoryPromptBlock } from '../skills/builtin/memory'
import { isTimeSkillActive } from '../skills/builtin/time'
import {
  createFocusedTranslatorHumanContent,
  createFocusedTranslatorSystemPrompt,
} from '../skills/builtin/translator'
import { callModelWithRuntimeTools } from '../tools'
import { createChatGenerationUsageSnapshot } from '../usage/snapshot'

const INPUT_ATTACHMENT_CONTENT_FETCH_CONCURRENCY = 3

export interface CreateCallModelNodeOptions {
  chatApi: AgentChatApiClient
  chatModelFactory: AgentChatModelFactory
  memoryApi?: AgentMemoryApiClient
  skillApi?: AgentSkillApiClient
  webSearch?: WebSearchClient
  skillActionProviders?: readonly RuntimeSkillActionProvider[]
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
      : await toLangChainMessages(
          applyAgentContextSnapshotsToMessages(state.messages, {
            triggerUserMessageId: config.context?.triggerUserMessageId,
            contextSnapshots: config.context?.contextSnapshots,
          }),
          state.olderMessagesExcerpt,
          state.historyDigest?.summary ?? null,
          config.context?.agentProfileConfig,
          config.context?.skillContext,
          config.context?.defaultResponseLanguage,
          state.memoryRetrieval,
          config.context?.triggerUserMessageId,
          isTimeSkillActive(config.context),
          isLocationSkillActive(config.context),
          await resolveInputAttachmentContents({
            chatApi: options.chatApi,
            generationId: config.context?.generationId,
            inputAttachments: config.context?.inputAttachments,
          }),
        )

    const streamResult = await callModelWithRuntimeTools({
      model,
      messages: langChainMessages,
      sessionId: state.sessionId,
      context: config.context,
      memoryApi: focusedTranslatorInvocation ? undefined : options.memoryApi,
      skillApi: focusedTranslatorInvocation ? undefined : options.skillApi,
      webSearch: focusedTranslatorInvocation ? undefined : options.webSearch,
      skillActionProviders: focusedTranslatorInvocation ? undefined : options.skillActionProviders,
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

async function resolveInputAttachmentContents(input: {
  chatApi: AgentChatApiClient
  generationId?: string | null
  inputAttachments?: AgentGraphContext['inputAttachments']
}): Promise<AgentChatAttachmentContent[]> {
  const attachments = input.inputAttachments ?? []
  if (attachments.length === 0) {
    return []
  }

  if (!input.generationId) {
    throw new Error('聊天附件缺少生成上下文')
  }

  return mapWithConcurrency(attachments, INPUT_ATTACHMENT_CONTENT_FETCH_CONCURRENCY, attachment =>
    input.chatApi.getGenerationAssetContent({
      generationId: input.generationId!,
      assetId: attachment.assetId,
    }))
}

async function mapWithConcurrency<TInput, TOutput>(
  items: readonly TInput[],
  concurrency: number,
  mapper: (item: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const results: TOutput[] = Array.from({ length: items.length })
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex]!)
    }
  }

  const workerCount = Math.min(concurrency, items.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

function toLangChainMessages(
  messages: AgentChatContextMessage[],
  olderMessagesExcerpt: string,
  historyDigestSummary: string | null,
  agentProfileConfig: AgentGraphContext['agentProfileConfig'],
  skillContext: AgentGraphContext['skillContext'],
  defaultResponseLanguage: AgentGraphContext['defaultResponseLanguage'],
  memoryRetrieval: AgentMemoryRetrievalSnapshot | null,
  triggerUserMessageId: string | null | undefined,
  timeSkillActive: boolean,
  locationSkillActive: boolean,
  inputAttachments: AgentChatAttachmentContent[],
) {
  const memoryPrompt = createAgentMemoryPromptBlock(memoryRetrieval)
  const systemPrompt = createAgentSystemPrompt({
    agentProfileConfig,
    skillContext,
    defaultResponseLanguage: defaultResponseLanguage ?? undefined,
    timeSkillActive,
    locationSkillActive,
    historyDigestSummary: historyDigestSummary ?? undefined,
    olderMessagesExcerpt,
  })
  return [
    new SystemMessage(memoryPrompt ? `${systemPrompt}\n\n${memoryPrompt}` : systemPrompt),
    ...toLangChainChatMessages(messages, {
      triggerUserMessageId,
      inputAttachments,
    }),
  ]
}
