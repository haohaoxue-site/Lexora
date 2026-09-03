import type { BuddyI18nKey } from '@/i18n/buddyI18n'

export interface ChatComposerNoticeInteraction {
  autoDismissMs: number | null
  dismissible: boolean
  id: string
  kind: 'notice'
  messageKey: BuddyI18nKey
  tone: 'info' | 'warning'
}

export type ChatComposerInteraction = ChatComposerNoticeInteraction
