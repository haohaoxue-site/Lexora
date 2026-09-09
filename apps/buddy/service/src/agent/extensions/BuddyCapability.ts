import type { ToolCallEvent } from '@earendil-works/pi-coding-agent'
import type { BuddySessionMode } from '../../../../shared/permissions/sessionMode'
import type { BuddyToolClassificationResult } from '../../approvals/toolClassification'
import type { DirectoryGrant } from '../../directories/resolveGrantedPath'
import type { BuddyInProcessExtension } from './BuddyInProcessExtension'
import type { BuddyToolDisclosurePolicy } from './discovery/toolDiscoveryContract'

export interface BuddyCapability {
  extension: BuddyInProcessExtension
  classify: (event: ToolCallEvent, signal: AbortSignal) =>
    BuddyToolClassificationResult | null | Promise<BuddyToolClassificationResult | null>
  workspaceMutationTools?: readonly string[]
  disclosure?: BuddyToolDisclosurePolicy
}

export interface BuddyCapabilityContext {
  conversationId: string
  cwd: string
  getRunId: () => string | undefined
  grants: readonly DirectoryGrant[]
  sessionMode: BuddySessionMode
  signal: AbortSignal
}

export type BuddyCapabilityFactory = (
  context: BuddyCapabilityContext,
) => Promise<readonly BuddyCapability[]>
