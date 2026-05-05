import type { ChatSession } from './composables/useChat'
import type { ChatMessage } from '@/apis/chat'

export interface ChatProviderSettingsDialogEmits {
  save: []
}

export interface ChatSessionSidebarProps {
  sessions: ChatSession[]
  activeSessionId: string | null
}

export interface ChatSessionSidebarEmits {
  create: []
  select: [id: string]
  delete: [id: string]
}

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
