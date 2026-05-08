import type { ChatSession } from './composables/useChat'
import type { ChatMessage } from '@/apis/chat'

export interface ChatModelSettingsDialogEmits {
  save: []
}

export interface ChatSessionSidebarProps {
  sessions: ChatSession[]
  activeSessionId: string | null
}

export interface ChatSessionSidebarEmits {
  create: []
  select: [id: string]
  rename: [id: string, title: string]
  delete: [id: string]
}

export type ChatSessionSidebarActionCommand = 'rename' | 'delete'

export interface ChatInputBoxProps {
  disabled: boolean
  placeholder?: string
}

export interface ChatInputBoxEmits {
  send: [content: string]
}

export interface ChatMessageListProps {
  messages: ChatMessage[]
  isStreaming: boolean
  isConfigured: boolean
}
