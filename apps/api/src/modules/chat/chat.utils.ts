import type {
  ChatMessage,
  ChatSessionDetail,
  ChatSessionSummary,
} from '@haohaoxue/samepage-contracts'
import { ChatSessionMessageRole } from '@prisma/client'

export interface ChatSessionSummaryRecord {
  id: string
  title: string
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
