import type { BuddyServiceTier } from '../../../shared/conversation/modelSelection'

export interface BuddyRunContext {
  flushProjectedEvents: () => Promise<void>
  onToolExecutionAuthorized: (event: {
    arguments: unknown
    toolCallId: string
    toolName: string
  }) => Promise<void>
  onToolExecutionDenied?: (event: {
    denialCode: string
    toolCallId: string
    toolName: string
  }) => Promise<void>
  runId: string
  serviceTier?: BuddyServiceTier | null
  signal: AbortSignal
}

export interface BuddyRunContextStore {
  current: BuddyRunContext | null
}
