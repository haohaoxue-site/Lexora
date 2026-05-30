import { CHAT_SESSION_ORIGIN } from '@haohaoxue/samepage-contracts'
import { createSharedComposable } from '@vueuse/core'
import { createChatEngine } from '@/composables/chat/createChatEngine'

export const useDocsChatEngine = createSharedComposable(() =>
  createChatEngine(CHAT_SESSION_ORIGIN.DOCS),
)

export type DocsChatEngine = ReturnType<typeof useDocsChatEngine>
