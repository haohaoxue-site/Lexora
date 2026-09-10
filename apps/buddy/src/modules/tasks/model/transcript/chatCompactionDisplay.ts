import type { LocalConversationTimelineItem } from '@buddy-shared/conversation/conversationApi'
import type { ChatAgentCompactionNode } from './chatRunCompaction'
import type { BuddyI18nKey, BuddyLocale } from '@/i18n/buddyI18n'
import { translateBuddy } from '@/i18n/buddyI18n'
import { projectConversationCompactionState } from './chatConversationTimeline'

export type ChatCompactionDisplayNode = ChatAgentCompactionNode | Extract<LocalConversationTimelineItem, { kind: 'compaction' }>

export function describeChatCompaction(node: ChatCompactionDisplayNode, language: BuddyLocale) {
  const state = node.status === 'interrupted'
    ? 'interrupted'
    : projectConversationCompactionState(node.status, 'errorCode' in node ? node.errorCode : null)
  const labels = {
    running: 'desktop.chat.compactionStarted',
    completed: 'desktop.chat.compactionCompleted',
    cancelled: 'desktop.chat.compactionCancelled',
    interrupted: 'desktop.chat.compactionInterrupted',
    failed: 'desktop.chat.compactionFailed',
    not_needed: 'desktop.chat.compactionNotNeeded',
    authentication_required: 'desktop.chat.compactionAuthenticationRequired',
    provider_unavailable: 'desktop.chat.compactionProviderUnavailable',
  } as const satisfies Record<typeof state, BuddyI18nKey>
  return {
    label: translateBuddy(language, labels[state]),
    active: state === 'running',
    warning: state === 'failed' || state === 'authentication_required' || state === 'provider_unavailable',
    detail: state === 'completed' && node.tokensBefore !== null && node.estimatedTokensAfter !== null
      ? translateBuddy(language, 'desktop.chat.compactionTokens', {
          before: new Intl.NumberFormat(language).format(node.tokensBefore),
          after: new Intl.NumberFormat(language).format(node.estimatedTokensAfter),
        })
      : '',
  }
}
