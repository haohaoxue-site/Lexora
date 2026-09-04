import type { ToolCallEvent } from '@earendil-works/pi-coding-agent'
import type { BuddyApprovalPolicy } from '../../../shared/approvalPolicy'
import type { BuddyExecutionProfile } from '../../../shared/executionProfile'
import type { BuddyServiceTier } from '../../../shared/modelSelection'
import type { BuddySessionMode } from '../../../shared/sessionMode'
import type { BuddyToolClassificationResult } from '../approvals/toolClassification'
import type { CreateAutomationToolOptions } from '../automations/createAutomationTool'
import type { BrowserCapabilityHost } from '../browser/BrowserCapabilityService'
import type { BuddyMcpTools } from '../connectors/mcp/McpConnectorService'
import type {
  DirectoryGrantMutation,
  DirectoryGrantService,
} from '../directories/DirectoryGrantService'
import type { DirectoryGrant } from '../directories/resolveGrantedPath'
import type { ImageGenerationGateway } from '../images/ImageGenerationGateway'
import type { CreatePetToolOptions } from '../pet/createPetTool'
import type { SystemHostPort } from '../system/systemCapability'
import type { BuddyInProcessExtension } from './createBuddyResourceLoader'
import type { BuddyRunContextStore } from './createReusableBuddySession'
import type {
  ChangeCaptureGateway,
} from './extensions/changeCaptureExtension'
import type { CreateImageGenerationExtensionOptions } from './extensions/imageGenerationExtension'
import type { CreateImageTransformExtensionOptions } from './extensions/imageTransformExtension'
import type { CreateOutputPresentationExtensionOptions } from './extensions/outputPresentationExtension'
import type {
  BuddyRunContext,
  CreateToolPolicyExtensionOptions,
  ToolApprovalGateway,
} from './extensions/toolPolicyExtension'
import { classifyOutputPresentTool } from '../artifacts/artifactToolContract'
import { classifyAutomationToolCall } from '../automations/createAutomationTool'
import { BrowserCapabilityService } from '../browser/BrowserCapabilityService'
import { classifyBrowserTool } from '../browser/browserToolContract'
import { classifyMcpTool } from '../connectors/mcp/mcpToolContract'
import { classifyImageGenerationTool } from '../images/imageGenerationToolContract'
import { classifyImageTransformTool } from '../images/imageTransformToolContract'
import { classifyPetTool } from '../pet/petToolContract'
import { SystemCapabilityService } from '../system/systemCapability'
import { classifySystemTool } from '../system/systemToolContract'
import { createAutomationExtension } from './extensions/automationExtension'
import { createBrowserExtension } from './extensions/browserExtension'
import { createChangeCaptureExtension } from './extensions/changeCaptureExtension'
import { createImageGenerationExtension } from './extensions/imageGenerationExtension'
import { createImageTransformExtension } from './extensions/imageTransformExtension'
import { createMcpExtension } from './extensions/mcpExtension'
import { createOutputPresentationExtension } from './extensions/outputPresentationExtension'
import { createPetExtension } from './extensions/petExtension'
import { createSystemExtension } from './extensions/systemExtension'
import { createSystemPromptExtension } from './extensions/systemPromptExtension'
import { createToolPolicyExtension } from './extensions/toolPolicyExtension'

type DirectoryGrantGateway = Pick<DirectoryGrantService, 'grant'>

interface BuddySessionConnectorSource {
  getTools: (signal?: AbortSignal) => Promise<BuddyMcpTools>
}

export interface BuddySessionCompositionServices {
  approvalService: ToolApprovalGateway
  artifactService: CreateImageGenerationExtensionOptions['artifactService']
    & CreateOutputPresentationExtensionOptions['artifactService']
  attachmentService: CreateImageGenerationExtensionOptions['attachmentService']
  automationService: CreateAutomationToolOptions['service']
  browserHost: BrowserCapabilityHost
  changeCaptureService: ChangeCaptureGateway
  connectorService: BuddySessionConnectorSource
  directoryGrants: DirectoryGrantGateway
  imageGenerationGateway: ImageGenerationGateway
  imageTransformService: CreateImageTransformExtensionOptions['service']
  onAutomationChanged: (automationId: string) => void
  petService: CreatePetToolOptions['service']
  systemHost: SystemHostPort
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
  inProcessExtensions: readonly BuddyInProcessExtension[]
  runContext: BuddyRunContextStore
}

export async function createBuddySessionComposition(
  options: CreateBuddySessionCompositionOptions,
): Promise<BuddySessionComposition> {
  const { services } = options
  const grants = [...options.grants]
  const mcp = await services.connectorService.getTools(options.signal)
  const runContext: BuddyRunContextStore = { current: null }
  const browserCapability = new BrowserCapabilityService({
    conversationId: options.conversationId,
    getGrants: () => grants,
    host: services.browserHost,
  })
  const systemCapability = new SystemCapabilityService({ host: services.systemHost })
  const classifyTool = createBuddyToolClassifier({
    automationService: services.automationService,
    browserCapability,
    mcpClassifications: mcp.classifications,
    systemCapability,
  })
  const inProcessExtensions: BuddyInProcessExtension[] = [
    createMcpExtension({ tools: mcp.tools }),
    createBrowserExtension({ service: browserCapability }),
    createImageGenerationExtension({
      artifactService: services.artifactService,
      attachmentService: services.attachmentService,
      conversationId: options.conversationId,
      cwd: options.canonicalRoot,
      getRunId: () => runContext.current?.runId,
      grants,
      imageGenerationGateway: services.imageGenerationGateway,
    }),
    createImageTransformExtension({
      conversationId: options.conversationId,
      cwd: options.canonicalRoot,
      getRunId: () => runContext.current?.runId,
      grants,
      service: services.imageTransformService,
    }),
    createOutputPresentationExtension({
      artifactService: services.artifactService,
      conversationId: options.conversationId,
      cwd: options.canonicalRoot,
      getRunId: () => runContext.current?.runId,
      grants,
    }),
    createPetExtension({
      getRunId: () => runContext.current?.runId,
      service: services.petService,
    }),
    createSystemExtension({ service: systemCapability }),
  ]

  if (options.sessionMode === 'interactive') {
    inProcessExtensions.push(createAutomationExtension({
      onChanged: services.onAutomationChanged,
      service: services.automationService,
    }))
  }

  inProcessExtensions.push(
    createToolPolicyExtension({
      applyGrant: async (proposal) => {
        const mutation = await services.directoryGrants.grant(proposal)
        applyGrantToSession(grants, mutation)
      },
      approvalAvailable: options.sessionMode === 'interactive',
      approvalPolicy: options.approvalPolicy,
      approvalService: services.approvalService,
      classifyTool,
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
    }),
  )
  inProcessExtensions.push(createSystemPromptExtension())

  return {
    getServiceTier: () => runContext.current?.serviceTier ?? null,
    inProcessExtensions,
    runContext,
  }
}

function applyGrantToSession(
  grants: DirectoryGrant[],
  mutation: DirectoryGrantMutation,
): void {
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

interface BuddyToolClassifierOptions {
  automationService: CreateAutomationToolOptions['service']
  browserCapability: Pick<
    BrowserCapabilityService,
    'classifyAction' | 'validateActionApproval'
  >
  mcpClassifications: BuddyMcpTools['classifications']
  systemCapability: SystemCapabilityService
}

function createBuddyToolClassifier(
  options: BuddyToolClassifierOptions,
): NonNullable<CreateToolPolicyExtensionOptions['classifyTool']> {
  return async (
    event: ToolCallEvent,
    activeRun: BuddyRunContext,
  ): Promise<BuddyToolClassificationResult> => {
    const automation = classifyAutomationToolCall(options.automationService, event)
    if (automation)
      return automation

    const imageTransform = classifyImageTransformTool(event)
    if (imageTransform)
      return imageTransform

    const outputPresentation = classifyOutputPresentTool(event)
    if (outputPresentation)
      return outputPresentation

    const browser = classifyBrowserTool(event, options.browserCapability)
    if (browser)
      return browser

    const system = await classifySystemTool(
      options.systemCapability,
      event,
      activeRun.signal,
    )
    if (system)
      return system

    const imageGeneration = classifyImageGenerationTool(event)
    if (imageGeneration)
      return imageGeneration

    const pet = classifyPetTool(event)
    if (pet)
      return pet

    const mcp = classifyMcpTool(options.mcpClassifications, event)
    if (mcp)
      return mcp

    return {}
  }
}
