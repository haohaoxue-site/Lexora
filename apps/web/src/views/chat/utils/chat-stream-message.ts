import type { ChatMessage, ChatStreamEvent } from '@/apis/chat'
import {
  CHAT_MESSAGE_FAILURE_REASON,
  CHAT_MESSAGE_PART_TYPE,
  CHAT_MESSAGE_STATUS,
  CHAT_STREAM_EVENT_TYPE,
} from '@haohaoxue/samepage-contracts'
import { nanoid } from 'nanoid'
import dayjs from '@/utils/dayjs'

type ChatMessagePart = ChatMessage['parts'][number]
type AppendablePartType
  = | typeof CHAT_MESSAGE_PART_TYPE.REASONING
    | typeof CHAT_MESSAGE_PART_TYPE.TEXT

export function createLocalChatMessage(input: {
  role: ChatMessage['role']
  status: ChatMessage['status']
  content: string
  order: number
}): ChatMessage {
  const now = dayjs().toISOString()
  const id = createLocalMessageId(input.role)

  return {
    id,
    role: input.role,
    status: input.status,
    content: input.content,
    order: input.order,
    parts: input.content
      ? [createLocalTextPart(id, input.role, input.content, now)]
      : [],
    metadata: null,
    createdAt: now,
    updatedAt: now,
    completedAt: input.status === CHAT_MESSAGE_STATUS.COMPLETED ? now : null,
  }
}

export function applyChatStreamEventToMessages(
  messages: ChatMessage[],
  event: ChatStreamEvent,
): ChatMessage[] {
  switch (event.type) {
    case CHAT_STREAM_EVENT_TYPE.MESSAGE_STARTED:
      return applyMessageStarted(messages, event)
    case CHAT_STREAM_EVENT_TYPE.REASONING_DELTA:
      return appendAssistantPartDelta(messages, event.messageId, CHAT_MESSAGE_PART_TYPE.REASONING, event.text)
    case CHAT_STREAM_EVENT_TYPE.TEXT_DELTA:
      return appendAssistantPartDelta(messages, event.messageId, CHAT_MESSAGE_PART_TYPE.TEXT, event.text)
    case CHAT_STREAM_EVENT_TYPE.MESSAGE_COMPLETED:
      return applyMessageCompleted(messages, event.messageId, event.content)
    case CHAT_STREAM_EVENT_TYPE.ERROR:
      return applyMessageFailed(messages, event.message)
    case CHAT_STREAM_EVENT_TYPE.RUN_COMPLETED:
    case CHAT_STREAM_EVENT_TYPE.TOOL_CALL_STARTED:
    case CHAT_STREAM_EVENT_TYPE.TOOL_CALL_ARGS_DELTA:
    case CHAT_STREAM_EVENT_TYPE.TOOL_CALL_COMPLETED:
    case CHAT_STREAM_EVENT_TYPE.TOOL_RESULT:
      return messages
  }
}

function applyMessageStarted(
  messages: ChatMessage[],
  event: Extract<ChatStreamEvent, { type: typeof CHAT_STREAM_EVENT_TYPE.MESSAGE_STARTED }>,
) {
  const now = dayjs().toISOString()
  const existingIndex = messages.findIndex(message => message.id === event.messageId)
  if (existingIndex >= 0) {
    return updateMessage(messages, existingIndex, {
      ...messages[existingIndex],
      status: CHAT_MESSAGE_STATUS.STREAMING,
      updatedAt: now,
    })
  }

  const placeholderIndex = findLatestAssistantIndex(messages, {
    preferStreaming: true,
    preferLocal: true,
  })

  if (placeholderIndex < 0) {
    return [
      ...messages,
      createAssistantMessage({
        id: event.messageId,
        status: CHAT_MESSAGE_STATUS.STREAMING,
        order: nextMessageOrder(messages),
        now,
      }),
    ]
  }

  const placeholder = messages[placeholderIndex]
  return updateMessage(messages, placeholderIndex, {
    ...placeholder,
    id: event.messageId,
    status: CHAT_MESSAGE_STATUS.STREAMING,
    parts: placeholder.parts.map(part => normalizeLocalPartMessageId(part, placeholder.id, event.messageId)),
    updatedAt: now,
  })
}

function appendAssistantPartDelta(
  messages: ChatMessage[],
  messageId: string,
  partType: AppendablePartType,
  delta: string,
) {
  if (!delta) {
    return messages
  }

  const target = resolveAssistantTarget(messages, messageId)
  const now = dayjs().toISOString()
  const nextMessage = target.message ?? createAssistantMessage({
    id: messageId,
    status: CHAT_MESSAGE_STATUS.STREAMING,
    order: nextMessageOrder(messages),
    now,
  })
  const nextParts = upsertAppendablePart(nextMessage, partType, delta, now, 'append')
  const nextContent = partType === CHAT_MESSAGE_PART_TYPE.TEXT
    ? getPartText(nextParts, CHAT_MESSAGE_PART_TYPE.TEXT)
    : nextMessage.content
  const updatedMessage: ChatMessage = {
    ...nextMessage,
    status: nextMessage.status === CHAT_MESSAGE_STATUS.COMPLETED
      ? nextMessage.status
      : CHAT_MESSAGE_STATUS.STREAMING,
    content: nextContent,
    parts: nextParts,
    updatedAt: now,
  }

  return target.index >= 0
    ? updateMessage(messages, target.index, updatedMessage)
    : [...messages, updatedMessage]
}

function applyMessageCompleted(
  messages: ChatMessage[],
  messageId: string,
  content: string,
) {
  const target = resolveAssistantTarget(messages, messageId)
  const now = dayjs().toISOString()
  const nextMessage = target.message ?? createAssistantMessage({
    id: messageId,
    status: CHAT_MESSAGE_STATUS.COMPLETED,
    order: nextMessageOrder(messages),
    now,
  })
  const hasTextPart = nextMessage.parts.some(part => part.type === CHAT_MESSAGE_PART_TYPE.TEXT)
  const nextParts = content || hasTextPart
    ? upsertAppendablePart(nextMessage, CHAT_MESSAGE_PART_TYPE.TEXT, content, now, 'replace')
    : nextMessage.parts
  const updatedMessage: ChatMessage = {
    ...nextMessage,
    status: CHAT_MESSAGE_STATUS.COMPLETED,
    content,
    parts: nextParts,
    updatedAt: now,
    completedAt: now,
  }

  return target.index >= 0
    ? updateMessage(messages, target.index, updatedMessage)
    : [...messages, updatedMessage]
}

function applyMessageFailed(messages: ChatMessage[], message: string) {
  const targetIndex = findLatestStreamingAssistantIndex(messages)

  if (targetIndex < 0) {
    return messages
  }

  const now = dayjs().toISOString()
  const target = messages[targetIndex]

  return updateMessage(messages, targetIndex, {
    ...target,
    status: CHAT_MESSAGE_STATUS.FAILED,
    metadata: {
      ...(target.metadata ?? {}),
      failureReason: CHAT_MESSAGE_FAILURE_REASON.FAILED,
      failureMessage: message,
    },
    updatedAt: now,
  })
}

function resolveAssistantTarget(messages: ChatMessage[], messageId: string) {
  const messageIndex = messages.findIndex(message => message.id === messageId)
  if (messageIndex >= 0) {
    return {
      index: messageIndex,
      message: messages[messageIndex],
    }
  }

  const placeholderIndex = findLatestAssistantIndex(messages, {
    preferStreaming: true,
    preferLocal: true,
  })

  if (placeholderIndex >= 0) {
    const placeholder = messages[placeholderIndex]
    return {
      index: placeholderIndex,
      message: {
        ...placeholder,
        id: messageId,
        parts: placeholder.parts.map(part => normalizeLocalPartMessageId(part, placeholder.id, messageId)),
      },
    }
  }

  return {
    index: -1,
    message: null,
  }
}

function upsertAppendablePart(
  message: ChatMessage,
  partType: AppendablePartType,
  text: string,
  now: string,
  mode: 'append' | 'replace',
) {
  const parts = [...message.parts]
  const partIndex = parts.findIndex(part => part.type === partType)

  if (partIndex >= 0) {
    const currentPart = parts[partIndex]
    parts[partIndex] = {
      ...currentPart,
      text: mode === 'append' ? currentPart.text + text : text,
      updatedAt: now,
    }
    return sortMessageParts(parts)
  }

  return sortMessageParts([
    ...parts,
    createLocalPart(message.id, partType, text, now),
  ])
}

function getPartText(parts: ChatMessagePart[], partType: AppendablePartType) {
  return parts.find(part => part.type === partType)?.text ?? ''
}

function createAssistantMessage(input: {
  id: string
  status: ChatMessage['status']
  order: number
  now: string
}): ChatMessage {
  return {
    id: input.id,
    role: 'assistant',
    status: input.status,
    content: '',
    order: input.order,
    parts: [],
    metadata: null,
    createdAt: input.now,
    updatedAt: input.now,
    completedAt: input.status === CHAT_MESSAGE_STATUS.COMPLETED ? input.now : null,
  }
}

function createLocalTextPart(
  messageId: string,
  role: ChatMessage['role'],
  text: string,
  now: string,
) {
  return createLocalPart(messageId, CHAT_MESSAGE_PART_TYPE.TEXT, text, now, role === 'assistant' ? 1 : 0)
}

function createLocalPart(
  messageId: string,
  type: AppendablePartType,
  text: string,
  now: string,
  order = type === CHAT_MESSAGE_PART_TYPE.REASONING ? 0 : 1,
): ChatMessagePart {
  return {
    id: createLocalPartId(messageId, type),
    type,
    text,
    order,
    metadata: null,
    createdAt: now,
    updatedAt: now,
  }
}

function normalizeLocalPartMessageId(part: ChatMessagePart, previousMessageId: string, nextMessageId: string) {
  if (!part.id.startsWith(`${previousMessageId}:`)) {
    return part
  }

  return {
    ...part,
    id: createLocalPartId(nextMessageId, part.type),
  }
}

function createLocalPartId(messageId: string, type: ChatMessagePart['type']) {
  return `${messageId}:${type}`
}

function sortMessageParts(parts: ChatMessagePart[]) {
  return [...parts].sort((first, second) => first.order - second.order)
}

function updateMessage(messages: ChatMessage[], index: number, nextMessage: ChatMessage) {
  const nextMessages = [...messages]
  nextMessages[index] = nextMessage
  return nextMessages
}

function findLatestAssistantIndex(
  messages: ChatMessage[],
  options: {
    preferStreaming: boolean
    preferLocal: boolean
  },
) {
  if (options.preferStreaming) {
    const streamingIndex = findLatestStreamingAssistantIndex(messages)
    if (streamingIndex >= 0) {
      return streamingIndex
    }
  }

  if (options.preferLocal) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]
      if (message.role === 'assistant' && message.id.startsWith('local:')) {
        return index
      }
    }
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'assistant') {
      return index
    }
  }

  return -1
}

function findLatestStreamingAssistantIndex(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === 'assistant' && message.status === CHAT_MESSAGE_STATUS.STREAMING) {
      return index
    }
  }

  return -1
}

function nextMessageOrder(messages: ChatMessage[]) {
  return (messages.at(-1)?.order ?? -1) + 1
}

function createLocalMessageId(role: ChatMessage['role']): string {
  return `local:${role}:${nanoid()}`
}
