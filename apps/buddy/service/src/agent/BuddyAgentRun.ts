import type { ImageContent } from '@earendil-works/pi-ai'
import type { BuddyServiceTier, BuddyThinkingLevel } from '../../../shared/modelSelection'
import type { RunRecord } from '../storage/runRecord'
import type { BuddySessionBlueprint } from './BuddySessionBlueprint'

export interface StartBuddyTurnInput {
  images?: ImageContent[]
  prompt: string
  runId: string
  serviceTier?: BuddyServiceTier | null
  session: BuddySessionBlueprint
  thinkingLevel?: BuddyThinkingLevel
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
