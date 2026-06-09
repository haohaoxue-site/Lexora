import type {
  AgentChatContextMessage,
  AgentChatRuntimeContext,
  AgentContextPolicy,
} from '@haohaoxue/samepage-contracts'
import type { BaseCheckpointSaver } from '@langchain/langgraph'
import type { AgentHistoryDigest } from './history-compaction'

export interface AgentCheckpointState {
  activePathKey: string
  activePathTailMessageId: string
  olderMessagesExcerpt: string
  historyDigest: AgentHistoryDigest | null
}

export interface AgentGraphInput {
  sessionId: string
  sessionHistoryVersion: number
  activePathKey: string
  activePathTailMessageId: string
  olderMessagesExcerpt: string
  historyDigest: AgentHistoryDigest | null
  messages: AgentChatContextMessage[]
}

export interface AgentGraphInputDecision {
  mode: 'cold-start' | 'continue'
  shouldResetCheckpoint: boolean
  graphInput: AgentGraphInput
}

export interface AgentContextWindow {
  olderMessagesExcerpt: string
  messages: AgentChatContextMessage[]
}

export const DEFAULT_AGENT_RECENT_USER_TURN_LIMIT = 3
const DEFAULT_AGENT_RECENT_MESSAGE_LIMIT = 20
const DEFAULT_AGENT_OLDER_MESSAGES_EXCERPT_MAX_LENGTH = 2_000

export async function readAgentCheckpointState(
  checkpointer: BaseCheckpointSaver | undefined,
  threadId: string,
): Promise<AgentCheckpointState | null> {
  const checkpoint = await checkpointer?.getTuple({
    configurable: {
      thread_id: threadId,
    },
  })

  if (!checkpoint) {
    return null
  }

  return parseAgentCheckpointState(checkpoint.checkpoint.channel_values)
}

export function resolveAgentGraphInput(
  runtimeContext: AgentChatRuntimeContext,
  checkpointState: AgentCheckpointState | null,
): AgentGraphInputDecision {
  const compatible = isAgentCheckpointCompatible(runtimeContext, checkpointState)
  const triggerUserMessage = readTriggerUserMessage(runtimeContext)

  return {
    mode: compatible ? 'continue' : 'cold-start',
    shouldResetCheckpoint: Boolean(checkpointState && !compatible),
    graphInput: {
      sessionId: runtimeContext.sessionId,
      sessionHistoryVersion: runtimeContext.sessionHistoryVersion,
      activePathKey: runtimeContext.activePathKey,
      activePathTailMessageId: runtimeContext.assistantMessageId,
      olderMessagesExcerpt: compatible ? checkpointState?.olderMessagesExcerpt ?? '' : '',
      historyDigest: compatible ? checkpointState?.historyDigest ?? null : null,
      messages: compatible ? [triggerUserMessage] : runtimeContext.messages,
    },
  }
}

function isAgentCheckpointCompatible(
  runtimeContext: AgentChatRuntimeContext,
  checkpointState: AgentCheckpointState | null,
): boolean {
  if (!checkpointState || !runtimeContext.triggerParentMessageId) {
    return false
  }

  if (
    checkpointState.activePathTailMessageId !== runtimeContext.triggerParentMessageId
  ) {
    return false
  }

  const checkpointPath = splitActivePathKey(checkpointState.activePathKey)
  const runtimePath = splitActivePathKey(runtimeContext.activePathKey)

  if (checkpointPath.at(-1) !== runtimeContext.triggerParentMessageId) {
    return false
  }

  if (!isPathPrefix(checkpointPath, runtimePath)) {
    return false
  }

  return runtimePath[checkpointPath.length] === runtimeContext.triggerUserMessageId
}

function parseAgentCheckpointState(channelValues: Record<string, unknown>): AgentCheckpointState | null {
  const activePathKey = readNonEmptyString(channelValues.activePathKey)
  const activePathTailMessageId = readNonEmptyString(channelValues.activePathTailMessageId)

  if (!activePathKey || !activePathTailMessageId) {
    return null
  }

  return {
    activePathKey,
    activePathTailMessageId,
    olderMessagesExcerpt: readString(channelValues.olderMessagesExcerpt),
    historyDigest: readAgentHistoryDigest(channelValues.historyDigest),
  }
}

export function trimAgentContextWindow(
  input: AgentContextWindow,
  contextPolicy?: AgentContextPolicy | null,
): AgentContextWindow {
  const recentUserTurnLimit = contextPolicy?.recentUserTurnLimit ?? DEFAULT_AGENT_RECENT_USER_TURN_LIMIT
  const recentMessageLimit = contextPolicy?.recentMessageLimit ?? DEFAULT_AGENT_RECENT_MESSAGE_LIMIT
  const olderMessagesExcerptMaxLength = contextPolicy?.olderMessagesExcerptMaxLength
    ?? DEFAULT_AGENT_OLDER_MESSAGES_EXCERPT_MAX_LENGTH
  const windowStartIndex = Math.max(
    getRecentMessageWindowStartIndex(input.messages, recentUserTurnLimit),
    Math.max(0, input.messages.length - recentMessageLimit),
  )

  if (windowStartIndex <= 0) {
    return input
  }

  const nextOlderMessagesExcerpt = appendAgentOlderMessagesExcerpt(
    input.olderMessagesExcerpt,
    input.messages.slice(0, windowStartIndex),
    olderMessagesExcerptMaxLength,
  )

  return {
    olderMessagesExcerpt: nextOlderMessagesExcerpt,
    messages: input.messages.slice(windowStartIndex),
  }
}

function readTriggerUserMessage(runtimeContext: AgentChatRuntimeContext): AgentChatContextMessage {
  const triggerUserMessage = runtimeContext.messages.find(message =>
    message.id === runtimeContext.triggerUserMessageId && message.role === 'user',
  )

  if (!triggerUserMessage) {
    throw new Error('聊天上下文缺少触发用户消息')
  }

  return triggerUserMessage
}

function getRecentMessageWindowStartIndex(messages: AgentChatContextMessage[], recentUserTurnLimit: number): number {
  let userTurnCount = 0

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role !== 'user') {
      continue
    }

    userTurnCount += 1
    if (userTurnCount === recentUserTurnLimit) {
      return index
    }
  }

  return 0
}

function appendAgentOlderMessagesExcerpt(
  excerpt: string,
  messages: AgentChatContextMessage[],
  maxLength: number,
): string {
  const additions = messages
    .map(message => `${message.role === 'user' ? '用户' : '助手'}：${message.content}`)
    .join('\n')
  const nextExcerpt = [excerpt, additions].filter(Boolean).join('\n')

  if (nextExcerpt.length <= maxLength) {
    return nextExcerpt
  }

  return nextExcerpt.slice(nextExcerpt.length - maxLength)
}

function splitActivePathKey(activePathKey: string): string[] {
  return activePathKey.split('>').filter(Boolean)
}

function isPathPrefix(prefix: string[], path: string[]): boolean {
  return prefix.every((messageId, index) => path[index] === messageId)
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readAgentHistoryDigest(value: unknown): AgentHistoryDigest | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const digest = value as Partial<AgentHistoryDigest>
  if (
    digest.schemaVersion !== 1
    || typeof digest.summary !== 'string'
    || !Array.isArray(digest.coveredMessageIds)
    || !digest.coveredMessageIds.every(item => typeof item === 'string')
    || typeof digest.sourceHistoryVersion !== 'number'
    || typeof digest.estimatedTokens !== 'number'
    || typeof digest.createdAt !== 'string'
    || typeof digest.updatedAt !== 'string'
  ) {
    return null
  }

  return {
    schemaVersion: 1,
    summary: digest.summary,
    coveredMessageIds: digest.coveredMessageIds,
    sourceHistoryVersion: digest.sourceHistoryVersion,
    estimatedTokens: digest.estimatedTokens,
    createdAt: digest.createdAt,
    updatedAt: digest.updatedAt,
  }
}
