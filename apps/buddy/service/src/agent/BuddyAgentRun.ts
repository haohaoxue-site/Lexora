import type { BuddyServiceTier, BuddyThinkingLevel } from '../../../shared/modelSelection'
import type { RunRecord } from '../storage/runRecord'
import type { BuddyInputReferenceV1 } from './BuddyInputReference'
import type { BuddySessionBlueprint } from './BuddySessionBlueprint'

export interface StartBuddyTurnInput {
  runId: string
  serviceTier?: BuddyServiceTier | null
  session: BuddySessionBlueprint
  thinkingLevel?: BuddyThinkingLevel
  userInput: BuddyInputReferenceV1
}

export interface StartBuddyCompactionInput {
  customInstructions?: string
  runId: string
  session: BuddySessionBlueprint
  thinkingLevel?: BuddyThinkingLevel
}

export interface BuddyTurnHandle {
  completion: Promise<RunRecord>
  runId: string
}
