import type { BuddyServiceTier } from '../../../../shared/conversation/modelSelection'
import type { BuddyApprovalPolicy } from '../../../../shared/permissions/approvalPolicy'
import type { BuddyExecutionProfile } from '../../../../shared/permissions/executionProfile'
import type { BuddySessionMode } from '../../../../shared/permissions/sessionMode'
import type { ApprovalService } from '../../approvals/ApprovalService'
import type { AttachmentService } from '../../attachments/AttachmentService'
import type { ChangeCaptureService } from '../../changes/ChangeCaptureService'
import type { DirectoryGrantMutation, DirectoryGrantService } from '../../directories/DirectoryGrantService'
import type { DirectoryGrant } from '../../directories/resolveGrantedPath'
import type { BuddyInputReferenceStore } from '../context/BuddyInputReference'
import type { BuddyCapabilityFactory } from './BuddyCapability'
import type { BuddyExtensionRunContextStore } from './BuddyExtensionRunContext'
import type { BuddyInProcessExtension } from './BuddyInProcessExtension'
import { createChangeCaptureExtension } from './changeCaptureExtension'
import { createToolDiscoveryCapability } from './discovery/toolDiscoveryExtension'
import { createInputReferenceExtension } from './inputReferenceExtension'
import { createToolPolicyExtension } from './toolPolicyExtension'

export interface BuddySessionExtensionServices {
  approvalService: Pick<ApprovalService, 'request'>
  attachmentService: Pick<AttachmentService, 'materializePiInputImages'>
  changeCaptureService: Pick<ChangeCaptureService, 'beginFileTool' | 'beginWorkspaceTool' | 'finalizeRun' | 'finishFileTool' | 'finishWorkspaceTool' | 'markPartial'>
  createCapabilities: BuddyCapabilityFactory
  directoryGrants: Pick<DirectoryGrantService, 'grant'>
}

export interface CreateBuddySessionExtensionsOptions {
  approvalPolicy: BuddyApprovalPolicy
  canonicalRoot: string
  conversationId: string
  executionProfile: BuddyExecutionProfile
  grants: readonly DirectoryGrant[]
  sessionMode: BuddySessionMode
  signal: AbortSignal
  spaceId: string | null
  services: BuddySessionExtensionServices
}

export interface BuddySessionExtensions {
  getServiceTier: () => BuddyServiceTier | null
  inputReferences: BuddyInputReferenceStore
  inProcessExtensions: readonly BuddyInProcessExtension[]
  runContext: BuddyExtensionRunContextStore
}

export async function createBuddySessionExtensions(
  options: CreateBuddySessionExtensionsOptions,
): Promise<BuddySessionExtensions> {
  const { services } = options
  const grants = [...options.grants]
  const runContext: BuddyExtensionRunContextStore = { current: null }
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
