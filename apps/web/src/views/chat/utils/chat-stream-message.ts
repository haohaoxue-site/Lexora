import type { ChatMessage, ChatSessionEvent } from '@/apis/chat'
import {
  CHAT_MESSAGE_FAILURE_REASON,
  CHAT_MESSAGE_PART_TYPE,
  CHAT_MESSAGE_STATUS,
  CHAT_SESSION_EVENT_TYPE,
} from '@haohaoxue/samepage-contracts'
import dayjs from '@/utils/dayjs'

type ChatMessagePart = ChatMessage['parts'][number]

export function applyChatSessionEventToMessages(
  messages: ChatMessage[],
  event: ChatSessionEvent,
): ChatMessage[] {
  switch (event.type) {
    case CHAT_SESSION_EVENT_TYPE.MESSAGE_PART_DELTA:
      return appendMessagePartDelta(messages, event.messageId, event.payload.partType, event.payload.delta)
    case CHAT_SESSION_EVENT_TYPE.MESSAGE_STATUS_CHANGED:
      return updateMessageStatus(messages, event.messageId, event.payload.status)
    case CHAT_SESSION_EVENT_TYPE.MESSAGE_COMPLETED:
      return completeMessage(messages, event.messageId, getPayloadString(event.payload, 'content') ?? '')
    case CHAT_SESSION_EVENT_TYPE.MESSAGE_FAILED:
      return failMessage(
        messages,
        event.messageId,
        getPayloadString(event.payload, 'failureMessage') ?? getPayloadString(event.payload, 'message') ?? '生成失败',
      )
    case CHAT_SESSION_EVENT_TYPE.MESSAGE_CANCELLED:
      return updateMessageStatus(messages, event.messageId, CHAT_MESSAGE_STATUS.CANCELLED, {
        completedAt: dayjs().toISOString(),
      })
    case CHAT_SESSION_EVENT_TYPE.MESSAGE_CREATED:
    case CHAT_SESSION_EVENT_TYPE.RUN_STARTED:
    case CHAT_SESSION_EVENT_TYPE.RUN_COMPLETED:
    case CHAT_SESSION_EVENT_TYPE.RUN_FAILED:
    case CHAT_SESSION_EVENT_TYPE.RUN_CANCELLED:
    case CHAT_SESSION_EVENT_TYPE.BRANCH_SWITCHED:
    case CHAT_SESSION_EVENT_TYPE.TITLE_UPDATED:
    case CHAT_SESSION_EVENT_TYPE.SNAPSHOT_REQUIRED:
      return messages
  }
}

function appendMessagePartDelta(
  messages: ChatMessage[],
  messageId: string,
  partType: ChatMessagePart['type'],
  delta: string,
): ChatMessage[] {
  if (!delta) {
    return messages
  }

  const index = messages.findIndex(message => message.id === messageId)
  if (index < 0) {
    return messages
  }

  const now = dayjs().toISOString()
  const message = messages[index]
  const parts = upsertPart(message, partType, delta, now)
  const content = partType === CHAT_MESSAGE_PART_TYPE.TEXT
    ? getPartText(parts, CHAT_MESSAGE_PART_TYPE.TEXT)
    : message.content

  return updateMessage(messages, index, {
    ...message,
    status: message.status === CHAT_MESSAGE_STATUS.COMPLETED
      ? message.status
      : CHAT_MESSAGE_STATUS.STREAMING,
    content,
    parts,
    updatedAt: now,
  })
}

function updateMessageStatus(
  messages: ChatMessage[],
  messageId: string,
  status: ChatMessage['status'],
  patch: Partial<Pick<ChatMessage, 'completedAt'>> = {},
): ChatMessage[] {
  const index = messages.findIndex(message => message.id === messageId)
  if (index < 0) {
    return messages
  }

  return updateMessage(messages, index, {
    ...messages[index],
    status,
    updatedAt: dayjs().toISOString(),
    ...patch,
  })
}

function completeMessage(
  messages: ChatMessage[],
  messageId: string,
  content: string,
): ChatMessage[] {
  const index = messages.findIndex(message => message.id === messageId)
  if (index < 0) {
    return messages
  }

  const now = dayjs().toISOString()
  const message = messages[index]
  const parts = content
    ? replaceTextPart(message, content, now)
    : message.parts

  return updateMessage(messages, index, {
    ...message,
    status: CHAT_MESSAGE_STATUS.COMPLETED,
    content,
    parts,
    updatedAt: now,
    completedAt: now,
  })
}

function failMessage(
  messages: ChatMessage[],
  messageId: string,
  failureMessage: string,
): ChatMessage[] {
  const index = messages.findIndex(message => message.id === messageId)
  if (index < 0) {
    return messages
  }

  const now = dayjs().toISOString()
  const message = messages[index]

  return updateMessage(messages, index, {
    ...message,
    status: CHAT_MESSAGE_STATUS.FAILED,
    metadata: {
      ...(message.metadata ?? {}),
      failureReason: CHAT_MESSAGE_FAILURE_REASON.FAILED,
      failureMessage,
    },
    updatedAt: now,
    completedAt: now,
  })
}

function upsertPart(
  message: ChatMessage,
  partType: ChatMessagePart['type'],
  delta: string,
  now: string,
): ChatMessagePart[] {
  const parts = [...message.parts]
  const index = parts.findIndex(part => part.type === partType)

  if (index >= 0) {
    const part = parts[index]
    parts[index] = {
      ...part,
      text: part.text + delta,
      updatedAt: now,
    }
    return sortParts(parts)
  }

  return sortParts([
    ...parts,
    createTransientPart(message.id, partType, delta, now),
  ])
}

function replaceTextPart(
  message: ChatMessage,
  content: string,
  now: string,
): ChatMessagePart[] {
  const parts = [...message.parts]
  const index = parts.findIndex(part => part.type === CHAT_MESSAGE_PART_TYPE.TEXT)

  if (index >= 0) {
    const part = parts[index]
    parts[index] = {
      ...part,
      text: content,
      updatedAt: now,
    }
    return sortParts(parts)
  }

  return sortParts([
    ...parts,
    createTransientPart(message.id, CHAT_MESSAGE_PART_TYPE.TEXT, content, now),
  ])
}

function createTransientPart(
  messageId: string,
  type: ChatMessagePart['type'],
  text: string,
  now: string,
): ChatMessagePart {
  return {
    id: `${messageId}:${type}`,
    type,
    text,
    order: getPartOrder(type),
    metadata: null,
    createdAt: now,
    updatedAt: now,
  }
}

function getPartText(parts: ChatMessagePart[], partType: ChatMessagePart['type']) {
  return parts.find(part => part.type === partType)?.text ?? ''
}

function getPartOrder(partType: ChatMessagePart['type']) {
  if (partType === CHAT_MESSAGE_PART_TYPE.REASONING) {
    return 0
  }

  if (partType === CHAT_MESSAGE_PART_TYPE.TEXT) {
    return 1
  }

  return 10
}

function sortParts(parts: ChatMessagePart[]) {
  return [...parts].sort((first, second) => first.order - second.order)
}

function updateMessage(messages: ChatMessage[], index: number, nextMessage: ChatMessage) {
  const nextMessages = [...messages]
  nextMessages[index] = nextMessage
  return nextMessages
}

function getPayloadString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key]
  return typeof value === 'string' && value.trim() ? value : null
}
