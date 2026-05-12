import type { ChatMessage } from '@/apis/chat'
import { CHAT_MESSAGE_PART_TYPE, CHAT_MESSAGE_STATUS } from '@haohaoxue/samepage-contracts'
import dayjs from '@/utils/dayjs'

export function getMessageText(message: ChatMessage) {
  if (message.role === 'user') {
    return message.content
  }

  return message.parts.find(part => part.type === CHAT_MESSAGE_PART_TYPE.TEXT)?.text ?? message.content
}

export function getReasoningText(message: ChatMessage) {
  if (message.role !== 'assistant') {
    return ''
  }

  return message.parts.find(part => part.type === CHAT_MESSAGE_PART_TYPE.REASONING)?.text ?? ''
}

export function getReasoningElapsedMs(message: ChatMessage) {
  const messageElapsedMs = message.metadata?.reasoningElapsedMs
  if (typeof messageElapsedMs === 'number') {
    return messageElapsedMs
  }

  const reasoningPart = message.parts.find(part => part.type === CHAT_MESSAGE_PART_TYPE.REASONING)
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
  if (message.role !== 'assistant' || message.status !== CHAT_MESSAGE_STATUS.FAILED) {
    return ''
  }

  return message.metadata?.failureMessage ?? '生成失败，请稍后重试。'
}

export function isAssistantStreamingMessage(message: ChatMessage) {
  return message.role === 'assistant' && message.status === CHAT_MESSAGE_STATUS.STREAMING
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
