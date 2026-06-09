import type { ChatConversationUsageView } from '../../utils/chat-usage-display'

export interface ChatContextBarProps {
  conversationUsage: ChatConversationUsageView | null
}

export interface ChatContextBarEmits {
  newChat: []
}
