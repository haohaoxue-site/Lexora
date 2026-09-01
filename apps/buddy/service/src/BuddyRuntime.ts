import type { BuddyExecutionProfile } from '../../shared/executionProfile'
import type {
  BuddyServiceTier,
  BuddyThinkingLevel,
} from '../../shared/modelSelection'
import type { toPublicRun } from './runs/publicRun'

export interface BuddyTurnContextItem {
  kind: 'file' | 'skill' | 'slashCommand'
  value: string
}

export interface BuddyTurnModelSelection {
  modelId: string
  providerId: string
  reasoning: BuddyThinkingLevel | null
  serviceTier: BuddyServiceTier | null
}

export interface BuddyStartTurnInput {
  attachmentIds: readonly string[]
  branchId: string | null
  content: string
  contextItems: readonly BuddyTurnContextItem[]
  conversationId: string | null
  draftId: string
  executionProfile: BuddyExecutionProfile
  modelSelection: BuddyTurnModelSelection | null
  spaceId: string | null
  requestId: string
}

export interface BuddyTurnStart {
  branchId: string
  conversationId: string
  run: ReturnType<typeof toPublicRun>
  runId: string
}

export interface BuddyRuntime {
  startTurn: (input: BuddyStartTurnInput) => Promise<BuddyTurnStart>
}
