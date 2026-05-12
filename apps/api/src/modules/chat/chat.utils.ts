import type {
  AiModelRef,
  ChatMessage,
  ChatMessageBranch,
  ChatMessageMetadata,
  ChatMessagePart,
  ChatMessagePartMetadata,
  ChatMessagePartType,
  ChatMessageStatus,
  ChatRunSummary,
  ChatSessionDetail,
  ChatSessionSummary,
} from '@haohaoxue/samepage-contracts'
import {
  CHAT_MESSAGE_PART_TYPE,
  CHAT_MESSAGE_STATUS,
} from '@haohaoxue/samepage-contracts'
import {
  ChatSessionMessageRole,
  ChatSessionMessagePartType as PrismaChatSessionMessagePartType,
  ChatSessionMessageStatus as PrismaChatSessionMessageStatus,
} from '@prisma/client'

export interface ChatSessionSummaryRecord {
  id: string
  title: string
  selectedProviderId: string | null
  selectedModelId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface ChatSessionMessageRecord {
  id: string
  role: ChatSessionMessageRole
  status: PrismaChatSessionMessageStatus
  content: string
  branch: ChatMessageBranch
  parts: ChatSessionMessagePartRecord[]
  metadata: unknown
  createdAt: Date
  updatedAt: Date
  completedAt: Date | null
}

export interface ChatSessionMessagePartRecord {
  id: string
  type: PrismaChatSessionMessagePartType
  text: string
  order: number
  metadata: unknown
  createdAt: Date
  updatedAt: Date
}

export interface ChatSessionDetailRecord extends ChatSessionSummaryRecord {
  activeRun?: ChatRunSummary | null
  latestSequence: number
  messages: ChatSessionMessageRecord[]
}

export function toChatSessionSummary(session: ChatSessionSummaryRecord): ChatSessionSummary {
  return {
    id: session.id,
    title: session.title,
    modelRef: toChatSessionModelRef(session),
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  }
}

export function toChatSessionDetail(session: ChatSessionDetailRecord): ChatSessionDetail {
  const detail: ChatSessionDetail = {
    ...toChatSessionSummary(session),
    latestSequence: session.latestSequence,
    messages: session.messages.map(message => ({
      id: message.id,
      role: toChatMessageRole(message.role),
      status: toChatMessageStatus(message.status),
      content: getChatMessageContentSnapshot(message),
      branch: message.branch,
      parts: message.parts.map(toChatMessagePart),
      metadata: toChatMessageMetadata(message.metadata),
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString(),
      completedAt: message.completedAt?.toISOString() ?? null,
    })),
  }

  if (session.activeRun) {
    detail.activeRun = session.activeRun
  }

  return detail
}

export function getChatMessageContentSnapshot(
  message: Pick<ChatSessionMessageRecord, 'content' | 'parts'>,
): string {
  return message.parts.find(part => part.type === PrismaChatSessionMessagePartType.TEXT)?.text ?? message.content
}

export function toChatMessageRole(role: ChatSessionMessageRole): ChatMessage['role'] {
  return role === ChatSessionMessageRole.USER ? 'user' : 'assistant'
}

export function toChatMessageStatus(status: PrismaChatSessionMessageStatus): ChatMessageStatus {
  if (status === PrismaChatSessionMessageStatus.PENDING) {
    return CHAT_MESSAGE_STATUS.PENDING
  }
  if (status === PrismaChatSessionMessageStatus.STREAMING) {
    return CHAT_MESSAGE_STATUS.STREAMING
  }
  if (status === PrismaChatSessionMessageStatus.FAILED) {
    return CHAT_MESSAGE_STATUS.FAILED
  }
  if (status === PrismaChatSessionMessageStatus.CANCELLED) {
    return CHAT_MESSAGE_STATUS.CANCELLED
  }

  return CHAT_MESSAGE_STATUS.COMPLETED
}

export function toPrismaChatMessagePartType(type: ChatMessagePartType): PrismaChatSessionMessagePartType {
  if (type === CHAT_MESSAGE_PART_TYPE.REASONING) {
    return PrismaChatSessionMessagePartType.REASONING
  }
  if (type === CHAT_MESSAGE_PART_TYPE.TOOL_CALL) {
    return PrismaChatSessionMessagePartType.TOOL_CALL
  }
  if (type === CHAT_MESSAGE_PART_TYPE.TOOL_RESULT) {
    return PrismaChatSessionMessagePartType.TOOL_RESULT
  }
  if (type === CHAT_MESSAGE_PART_TYPE.SOURCE) {
    return PrismaChatSessionMessagePartType.SOURCE
  }
  if (type === CHAT_MESSAGE_PART_TYPE.CITATION) {
    return PrismaChatSessionMessagePartType.CITATION
  }

  return PrismaChatSessionMessagePartType.TEXT
}

function toChatMessagePart(part: ChatSessionMessagePartRecord): ChatMessagePart {
  return {
    id: part.id,
    type: toChatMessagePartType(part.type),
    text: part.text,
    order: part.order,
    metadata: toChatMessagePartMetadata(part.metadata),
    createdAt: part.createdAt.toISOString(),
    updatedAt: part.updatedAt.toISOString(),
  }
}

function toChatMessagePartType(type: PrismaChatSessionMessagePartType): ChatMessagePartType {
  if (type === PrismaChatSessionMessagePartType.REASONING) {
    return CHAT_MESSAGE_PART_TYPE.REASONING
  }
  if (type === PrismaChatSessionMessagePartType.TOOL_CALL) {
    return CHAT_MESSAGE_PART_TYPE.TOOL_CALL
  }
  if (type === PrismaChatSessionMessagePartType.TOOL_RESULT) {
    return CHAT_MESSAGE_PART_TYPE.TOOL_RESULT
  }
  if (type === PrismaChatSessionMessagePartType.SOURCE) {
    return CHAT_MESSAGE_PART_TYPE.SOURCE
  }
  if (type === PrismaChatSessionMessagePartType.CITATION) {
    return CHAT_MESSAGE_PART_TYPE.CITATION
  }

  return CHAT_MESSAGE_PART_TYPE.TEXT
}

function toChatMessageMetadata(metadata: unknown): ChatMessageMetadata | null {
  return isRecord(metadata) ? metadata as ChatMessageMetadata : null
}

function toChatMessagePartMetadata(metadata: unknown): ChatMessagePartMetadata | null {
  return isRecord(metadata) ? metadata as ChatMessagePartMetadata : null
}

export function toChatSessionModelRef(
  session: Pick<ChatSessionSummaryRecord, 'selectedProviderId' | 'selectedModelId'>,
): Pick<AiModelRef, 'providerId' | 'modelId'> | null {
  if (!session.selectedProviderId || !session.selectedModelId) {
    return null
  }

  return {
    providerId: session.selectedProviderId,
    modelId: session.selectedModelId,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
