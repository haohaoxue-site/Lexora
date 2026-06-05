import type { ChatMessage } from '@/apis/chat'
import type { ChatMarkdownRenderPhase } from '@/components/chat-markdown/typing'
import { CHAT_MESSAGE_PART_TYPE, CHAT_MESSAGE_STATUS } from '@haohaoxue/samepage-contracts/chat/constants'
import dayjs from '@/utils/dayjs'

type AssistantChatMessage = Extract<ChatMessage, { role: 'assistant' }>
type ChatMessagePart = ChatMessage['parts'][number]

export interface AssistantMessageDisplayModel {
  reasoningText: string
  reasoningElapsedMs: number | null
  messageText: string
  messageTextPartId: string
  toolResultParts: ChatMessagePart[]
  markdownPhase: ChatMarkdownRenderPhase
  isStreaming: boolean
  showPending: boolean
  failureMessage: string
  showCancelled: boolean
}

export function createAssistantMessageDisplayModel(message: ChatMessage): AssistantMessageDisplayModel {
  return {
    reasoningText: getReasoningText(message),
    reasoningElapsedMs: getReasoningElapsedMs(message),
    messageText: getMessageText(message),
    messageTextPartId: getMessageTextPartId(message),
    toolResultParts: getToolResultParts(message),
    markdownPhase: getMarkdownRenderPhase(message),
    isStreaming: isAssistantStreamingMessage(message),
    showPending: shouldShowAssistantPending(message),
    failureMessage: getAssistantFailureMessage(message),
    showCancelled: shouldShowAssistantCancelled(message),
  }
}

export function getMessageText(message: ChatMessage) {
  if (message.role === 'user') {
    return message.content
  }

  return message.parts.find(part => part.type === CHAT_MESSAGE_PART_TYPE.TEXT)?.text ?? message.content
}

export function getMessageTextPartId(message: ChatMessage) {
  if (message.role !== 'assistant') {
    return `${message.id}:content`
  }

  return message.parts.find(part => part.type === CHAT_MESSAGE_PART_TYPE.TEXT)?.id ?? `${message.id}:content`
}

export function getReasoningText(message: ChatMessage) {
  if (message.role !== 'assistant') {
    return ''
  }

  return message.parts.find(part => part.type === CHAT_MESSAGE_PART_TYPE.REASONING)?.text ?? ''
}

export function getToolResultParts(message: ChatMessage): ChatMessagePart[] {
  if (message.role !== 'assistant') {
    return []
  }

  return message.parts.filter(part => part.type === CHAT_MESSAGE_PART_TYPE.TOOL_RESULT)
}

export function getReasoningElapsedMs(message: ChatMessage) {
  const assistantMessage = toAssistantChatMessage(message)
  if (!assistantMessage) {
    return null
  }

  const messageElapsedMs = assistantMessage.metadata?.reasoningElapsedMs
  if (typeof messageElapsedMs === 'number') {
    return messageElapsedMs
  }

  const reasoningPart = assistantMessage.parts.find(part => part.type === CHAT_MESSAGE_PART_TYPE.REASONING)
  const partElapsedMs = reasoningPart?.metadata?.elapsedMs
  if (typeof partElapsedMs === 'number') {
    return partElapsedMs
  }

  if (!reasoningPart) {
    return null
  }

  const startedAt = dayjs(reasoningPart.createdAt)
  const updatedAt = dayjs(reasoningPart.updatedAt)
  if (!startedAt.isValid() || !updatedAt.isValid()) {
    return null
  }

  const elapsedMs = updatedAt.diff(startedAt)
  return elapsedMs > 0 ? elapsedMs : null
}

export function getAssistantFailureMessage(message: ChatMessage) {
  const assistantMessage = toAssistantChatMessage(message)
  if (!assistantMessage || assistantMessage.status !== CHAT_MESSAGE_STATUS.FAILED) {
    return ''
  }

  return assistantMessage.metadata?.failureMessage ?? '生成失败，请稍后重试。'
}

export function isAssistantStreamingMessage(message: ChatMessage) {
  return message.role === 'assistant' && message.status === CHAT_MESSAGE_STATUS.STREAMING
}

export function getMarkdownRenderPhase(message: ChatMessage): ChatMarkdownRenderPhase {
  if (
    message.role === 'assistant'
    && (
      message.status === CHAT_MESSAGE_STATUS.PENDING
      || message.status === CHAT_MESSAGE_STATUS.STREAMING
    )
  ) {
    return 'streaming'
  }

  return 'final'
}

export function shouldShowAssistantPending(message: ChatMessage) {
  return (
    message.role === 'assistant'
    && (isAssistantStreamingMessage(message) || message.status === CHAT_MESSAGE_STATUS.PENDING)
    && !getReasoningText(message)
    && !getMessageText(message)
  )
}

export function shouldShowAssistantCancelled(message: ChatMessage) {
  return message.role === 'assistant' && message.status === CHAT_MESSAGE_STATUS.CANCELLED
}

function toAssistantChatMessage(message: ChatMessage): AssistantChatMessage | null {
  return message.role === 'assistant' ? message as AssistantChatMessage : null
}
