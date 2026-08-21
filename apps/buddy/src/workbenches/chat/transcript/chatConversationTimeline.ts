import type { LocalConversationTimelineItem } from '@buddy-electron/shared/localChatApi'

type LocalConversationCompaction = Extract<LocalConversationTimelineItem, { kind: 'compaction' }>

export type ConversationCompactionState
  = | 'running'
    | 'completed'
    | 'cancelled'
    | 'not_needed'
    | 'authentication_required'
    | 'provider_unavailable'
    | 'failed'

export interface ConversationCompactionPresentation {
  state: ConversationCompactionState
  tokensBefore?: number
  estimatedTokensAfter?: number
}

export function projectConversationCompaction(
  item: LocalConversationCompaction,
): ConversationCompactionPresentation {
  const state = projectConversationCompactionState(item.status, item.errorCode)
  if (
    state === 'completed'
    && item.tokensBefore !== null
    && item.estimatedTokensAfter !== null
  ) {
    return {
      estimatedTokensAfter: item.estimatedTokensAfter,
      state,
      tokensBefore: item.tokensBefore,
    }
  }
  return { state }
}

export function projectConversationCompactionState(
  status: LocalConversationCompaction['status'],
  errorCode: string | null,
): ConversationCompactionState {
  if (status === 'queued' || status === 'running')
    return 'running'
  if (status === 'completed')
    return 'completed'
  if (status === 'cancelled')
    return 'cancelled'
  if (errorCode === 'CONTEXT_COMPACTION_NOT_NEEDED')
    return 'not_needed'
  if (errorCode === 'AUTHENTICATION_REQUIRED')
    return 'authentication_required'
  if (errorCode === 'PROVIDER_UNAVAILABLE')
    return 'provider_unavailable'
  return 'failed'
}
