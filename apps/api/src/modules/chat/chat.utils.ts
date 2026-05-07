import type {
  AiModelRef,
  ChatMessage,
  ChatSessionDetail,
  ChatSessionSummary,
} from '@haohaoxue/samepage-contracts'
import { ChatSessionMessageRole } from '@prisma/client'

export interface ChatSessionSummaryRecord {
  id: string
  title: string
  selectedModelServiceConfigId: string | null
  selectedModelId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface ChatSessionMessageRecord {
  role: ChatSessionMessageRole
  content: string
}

export interface ChatSessionDetailRecord extends ChatSessionSummaryRecord {
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
  return {
    ...toChatSessionSummary(session),
    messages: session.messages.map(message => ({
      role: toChatMessageRole(message.role),
      content: message.content,
    })),
  }
}

export function toChatMessageRole(role: ChatSessionMessageRole): ChatMessage['role'] {
  return role === ChatSessionMessageRole.USER ? 'user' : 'assistant'
}

export function toChatSessionModelRef(
  session: Pick<ChatSessionSummaryRecord, 'selectedModelServiceConfigId' | 'selectedModelId'>,
): Pick<AiModelRef, 'configId' | 'modelId'> | null {
  if (!session.selectedModelServiceConfigId || !session.selectedModelId) {
    return null
  }

  return {
    configId: session.selectedModelServiceConfigId,
    modelId: session.selectedModelId,
  }
}
