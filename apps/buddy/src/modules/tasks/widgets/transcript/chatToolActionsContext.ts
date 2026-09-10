import { createInjectionContext } from '@/shared/composables/createInjectionContext'

export interface ChatToolActions {
  canPreviewFile: (path: string) => boolean
  previewFile: (path: string) => void
  writeClipboardText: (text: string) => Promise<void>
}

export const { key: chatToolActionsKey, useContext: useChatToolActions }
  = createInjectionContext<ChatToolActions>('Chat tool actions')
