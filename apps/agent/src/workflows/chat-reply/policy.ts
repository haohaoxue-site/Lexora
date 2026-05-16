import type {
  AgentChatContextMessage,
  AgentChatRuntimeContext,
} from '@haohaoxue/samepage-contracts'
import type { BaseCheckpointSaver } from '@langchain/langgraph'

export interface ChatReplyCheckpointState {
  activePathKey: string
  activePathTailMessageId: string
  olderMessagesExcerpt: string
}

export interface ChatReplyGraphInput {
  sessionId: string
  sessionHistoryVersion: number
  activePathKey: string
  activePathTailMessageId: string
  olderMessagesExcerpt: string
  messages: AgentChatContextMessage[]
}

export interface ChatReplyGraphInputDecision {
  mode: 'cold-start' | 'continue'
  shouldResetCheckpoint: boolean
  graphInput: ChatReplyGraphInput
}

export interface ChatReplyMessageContext {
  olderMessagesExcerpt: string
  messages: AgentChatContextMessage[]
}

export const CHAT_REPLY_RECENT_USER_TURN_LIMIT = 3
const CHAT_REPLY_OLDER_MESSAGES_EXCERPT_MAX_LENGTH = 2_000

export async function readChatReplyCheckpointState(
  checkpointer: BaseCheckpointSaver | undefined,
  threadId: string,
): Promise<ChatReplyCheckpointState | null> {
  const checkpoint = await checkpointer?.getTuple({
    configurable: {
      thread_id: threadId,
    },
  })

  if (!checkpoint) {
    return null
  }

  return parseChatReplyCheckpointState(checkpoint.checkpoint.channel_values)
}

export function resolveChatReplyGraphInput(
  runtimeContext: AgentChatRuntimeContext,
  checkpointState: ChatReplyCheckpointState | null,
): ChatReplyGraphInputDecision {
  const compatible = isChatReplyCheckpointCompatible(runtimeContext, checkpointState)
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
      messages: compatible ? [triggerUserMessage] : runtimeContext.messages,
    },
  }
}

function isChatReplyCheckpointCompatible(
  runtimeContext: AgentChatRuntimeContext,
  checkpointState: ChatReplyCheckpointState | null,
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

function parseChatReplyCheckpointState(channelValues: Record<string, unknown>): ChatReplyCheckpointState | null {
  const activePathKey = readNonEmptyString(channelValues.activePathKey)
  const activePathTailMessageId = readNonEmptyString(channelValues.activePathTailMessageId)

  if (!activePathKey || !activePathTailMessageId) {
    return null
  }

  return {
    activePathKey,
    activePathTailMessageId,
    olderMessagesExcerpt: readString(channelValues.olderMessagesExcerpt),
  }
}

export function trimChatReplyMessageContext(input: ChatReplyMessageContext): ChatReplyMessageContext {
  const windowStartIndex = getRecentMessageWindowStartIndex(input.messages)
  if (windowStartIndex <= 0) {
    return input
  }

  const nextOlderMessagesExcerpt = appendChatReplyOlderMessagesExcerpt(
    input.olderMessagesExcerpt,
    input.messages.slice(0, windowStartIndex),
  )

  return {
    olderMessagesExcerpt: nextOlderMessagesExcerpt,
    messages: input.messages.slice(windowStartIndex),
  }
}

function readTriggerUserMessage(runtimeContext: AgentChatRuntimeContext): AgentChatContextMessage {
  const triggerUserMessage = runtimeContext.messages.at(-1)

  if (!triggerUserMessage || triggerUserMessage.role !== 'user') {
    throw new Error('聊天上下文缺少触发用户消息')
  }

  return triggerUserMessage
}

function getRecentMessageWindowStartIndex(messages: AgentChatContextMessage[]): number {
  let userTurnCount = 0

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role !== 'user') {
      continue
    }

    userTurnCount += 1
    if (userTurnCount === CHAT_REPLY_RECENT_USER_TURN_LIMIT) {
      return index
    }
  }

  return 0
}

function appendChatReplyOlderMessagesExcerpt(excerpt: string, messages: AgentChatContextMessage[]): string {
  const additions = messages
    .map(message => `${message.role === 'user' ? '用户' : '助手'}：${message.content}`)
    .join('\n')
  const nextExcerpt = [excerpt, additions].filter(Boolean).join('\n')

  if (nextExcerpt.length <= CHAT_REPLY_OLDER_MESSAGES_EXCERPT_MAX_LENGTH) {
    return nextExcerpt
  }

  return nextExcerpt.slice(nextExcerpt.length - CHAT_REPLY_OLDER_MESSAGES_EXCERPT_MAX_LENGTH)
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
