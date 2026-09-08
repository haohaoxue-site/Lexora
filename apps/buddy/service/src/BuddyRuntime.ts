import type { BuddyComposerDraftSend } from '../../shared/conversation/composerDraft'
import type { toPublicRun } from './runs/publicRun'

export interface BuddyTurnContextItem {
  kind: 'file' | 'skill' | 'slashCommand'
  value: string
}

export type BuddyStartTurnInput = BuddyComposerDraftSend

export interface BuddyTurnStart {
  branchId: string
  conversationId: string
  draftReceipt: {
    committedRevision: number
    draftId: string
    sourceRevision: number
  } | null
  run: ReturnType<typeof toPublicRun>
  runId: string
}

export interface BuddyRuntime {
  startTurn: (input: BuddyStartTurnInput) => Promise<BuddyTurnStart>
}
