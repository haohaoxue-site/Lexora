import type { BuddyApprovalPolicy } from '../../../shared/approvalPolicy'
import type { BuddyExecutionProfile } from '../../../shared/executionProfile'
import type { BuddyServiceTier } from '../../../shared/modelSelection'
import type { BuddySessionMode } from '../../../shared/sessionMode'
import type { ApprovalService } from '../approvals/ApprovalService'
import type { AttachmentService } from '../attachments/AttachmentService'
import type { ChangeCaptureService } from '../changes/ChangeCaptureService'
import type { DirectoryGrantMutation, DirectoryGrantService } from '../directories/DirectoryGrantService'
import type { DirectoryGrant } from '../directories/resolveGrantedPath'
import type { BuddyInputReferenceStore } from './BuddyInputReference'
import type { BuddyRunContextStore } from './BuddyRunContext'
import type { BuddySessionCapabilityFactory } from './BuddySessionCapability'
import type { BuddyInProcessExtension } from './createBuddyResourceLoader'
import { createToolDiscoveryCapability } from './discovery/toolDiscoveryExtension'
import { createChangeCaptureExtension } from './hooks/changeCaptureExtension'
import { createInputReferenceExtension } from './hooks/inputReferenceExtension'
import { createToolPolicyExtension } from './hooks/toolPolicyExtension'

export interface BuddySessionCompositionServices {
  approvalService: Pick<ApprovalService, 'request'>
  attachmentService: Pick<AttachmentService, 'materializePiInputImages'>
  changeCaptureService: Pick<ChangeCaptureService, 'beginFileTool' | 'beginWorkspaceTool' | 'finalizeRun' | 'finishFileTool' | 'finishWorkspaceTool' | 'markPartial'>
  createCapabilities: BuddySessionCapabilityFactory
  directoryGrants: Pick<DirectoryGrantService, 'grant'>
}

export interface CreateBuddySessionCompositionOptions {
  approvalPolicy: BuddyApprovalPolicy
  canonicalRoot: string
  conversationId: string
  executionProfile: BuddyExecutionProfile
  grants: readonly DirectoryGrant[]
  sessionMode: BuddySessionMode
  signal: AbortSignal
  spaceId: string | null
  services: BuddySessionCompositionServices
}

export interface BuddySessionComposition {
  getServiceTier: () => BuddyServiceTier | null
  inputReferences: BuddyInputReferenceStore
  inProcessExtensions: readonly BuddyInProcessExtension[]
  runContext: BuddyRunContextStore
}

export async function createBuddySessionComposition(
  options: CreateBuddySessionCompositionOptions,
): Promise<BuddySessionComposition> {
  const { services } = options
  const grants = [...options.grants]
  const runContext: BuddyRunContextStore = { current: null }
  const inputReferences: BuddyInputReferenceStore = { pending: null }
  const capabilities = await services.createCapabilities({
    conversationId: options.conversationId,
    cwd: options.canonicalRoot,
    getRunId: () => runContext.current?.runId,
    grants,
    sessionMode: options.sessionMode,
    signal: options.signal,
  })
  options.signal.throwIfAborted()
  const discovery = createToolDiscoveryCapability(capabilities.flatMap(capability => capability.disclosure ? [capability.disclosure] : []))
  const sessionCapabilities = [...capabilities, discovery]
  const inProcessExtensions: BuddyInProcessExtension[] = [
    createInputReferenceExtension(inputReferences),
    ...sessionCapabilities.map(capability => capability.extension),
    createToolPolicyExtension({
      applyGrant: async (proposal) => {
        const mutation = await services.directoryGrants.grant(proposal)
        applyGrantToSession(grants, mutation)
      },
      approvalAvailable: options.sessionMode === 'interactive',
      approvalPolicy: options.approvalPolicy,
      approvalService: services.approvalService,
      classifyTool: async (event, run) => {
        for (const capability of sessionCapabilities) {
          const classification = await capability.classify(event, run.signal)
          if (classification)
            return classification
        }
        return {}
      },
      cwd: options.canonicalRoot,
      executionProfile: options.executionProfile,
      getGrants: () => grants,
      getRunContext: () => runContext.current,
      owner: options.spaceId
        ? { id: options.spaceId, kind: 'space' }
        : { id: options.conversationId, kind: 'conversation' },
    }),
    createChangeCaptureExtension({
      conversationId: options.conversationId,
      cwd: options.canonicalRoot,
      getRunContext: () => runContext.current,
      grants,
      service: services.changeCaptureService,
      workspaceMutationTools: capabilities.flatMap(capability => capability.workspaceMutationTools ?? []),
    }),
  ]

  return {
    getServiceTier: () => runContext.current?.serviceTier ?? null,
    inputReferences,
    inProcessExtensions,
    runContext,
  }
}

function applyGrantToSession(grants: DirectoryGrant[], mutation: DirectoryGrantMutation): void {
  const covered = new Set(mutation.coveredGrantIds)
  for (let index = grants.length - 1; index >= 0; index -= 1) {
    if (covered.has(grants[index]!.grantId))
      grants.splice(index, 1)
  }
  if (grants.some(grant => grant.grantId === mutation.grant.id))
    return
  grants.push({
    canonicalRoot: mutation.grant.canonicalRoot,
    grantId: mutation.grant.id,
    kind: 'granted',
    root: mutation.grant.root,
  })
}
