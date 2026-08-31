import type { ToolCallEvent } from '@earendil-works/pi-coding-agent'
import type { BuddyExecutionProfile } from '../../../shared/executionProfile'
import type { BuddyServiceTier } from '../../../shared/modelSelection'
import type { BuddySessionMode } from '../../../shared/sessionMode'
import type { BuddyToolClassificationResult } from '../approvals/toolClassification'
import type { CreateAutomationToolOptions } from '../automations/createAutomationTool'
import type { BuddyMcpTools } from '../connectors/mcp/McpConnectorService'
import type { ImageGenerationGateway } from '../images/ImageGenerationGateway'
import type { CreatePetToolOptions } from '../pet/createPetTool'
import type { ProjectGrant } from '../projects/resolveGrantedPath'
import type { SystemHostPort } from '../system/systemCapability'
import type { BuddyInProcessExtension } from './createBuddyResourceLoader'
import type { BuddyRunContextStore } from './createReusableBuddySession'
import type { CreateArtifactExtensionOptions } from './extensions/artifactExtension'
import type { ChangeCaptureGateway } from './extensions/changeCaptureExtension'
import type { CreateImageGenerationExtensionOptions } from './extensions/imageGenerationExtension'
import type { CreateImageTransformExtensionOptions } from './extensions/imageTransformExtension'
import type {
  BuddyRunContext,
  CreateToolPolicyExtensionOptions,
  ToolApprovalGateway,
} from './extensions/toolPolicyExtension'
import { classifyArtifactTool } from '../artifacts/artifactToolContract'
import { classifyAutomationToolCall } from '../automations/createAutomationTool'
import { classifyMcpTool } from '../connectors/mcp/mcpToolContract'
import { classifyImageGenerationTool } from '../images/imageGenerationToolContract'
import { classifyImageTransformTool } from '../images/imageTransformToolContract'
import { classifyPetTool } from '../pet/petToolContract'
import { SystemCapabilityService } from '../system/systemCapability'
import { classifySystemTool } from '../system/systemToolContract'
import { createArtifactExtension } from './extensions/artifactExtension'
import { createAutomationExtension } from './extensions/automationExtension'
import { createChangeCaptureExtension } from './extensions/changeCaptureExtension'
import { createImageGenerationExtension } from './extensions/imageGenerationExtension'
import { createImageTransformExtension } from './extensions/imageTransformExtension'
import { createMcpExtension } from './extensions/mcpExtension'
import { createPetExtension } from './extensions/petExtension'
import { createSystemExtension } from './extensions/systemExtension'
import { createSystemPromptExtension } from './extensions/systemPromptExtension'
import { createToolPolicyExtension } from './extensions/toolPolicyExtension'

interface BuddySessionConnectorSource {
  getTools: (signal?: AbortSignal) => Promise<BuddyMcpTools>
}

export interface BuddySessionCompositionServices {
  approvalService: ToolApprovalGateway
  artifactService: CreateImageGenerationExtensionOptions['artifactService']
    & CreateArtifactExtensionOptions['artifactService']
  attachmentService: CreateImageGenerationExtensionOptions['attachmentService']
  automationService: CreateAutomationToolOptions['service']
  changeCaptureService: ChangeCaptureGateway
  connectorService: BuddySessionConnectorSource
  imageGenerationGateway: ImageGenerationGateway
  imageTransformService: CreateImageTransformExtensionOptions['service']
  onAutomationChanged: (automationId: string) => void
  petService: CreatePetToolOptions['service']
  systemHost: SystemHostPort
}

export interface CreateBuddySessionCompositionOptions {
  canonicalRoot: string
  conversationId: string
  executionProfile: BuddyExecutionProfile
  grants: readonly ProjectGrant[]
  scratchRoot: string
  sessionMode: BuddySessionMode
  signal: AbortSignal
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
  const scratchGrant = options.grants.find(
    grant => grant.canonicalRoot === options.scratchRoot,
  )
  if (!scratchGrant)
    throw new Error('Lexora Buddy scratch grant is unavailable')
  const mcp = await services.connectorService.getTools(options.signal)
  const runContext: BuddyRunContextStore = { current: null }
  const systemCapability = new SystemCapabilityService({ host: services.systemHost })
  const classifyTool = createBuddyToolClassifier({
    automationService: services.automationService,
    mcpClassifications: mcp.classifications,
    systemCapability,
  })
  const inProcessExtensions: BuddyInProcessExtension[] = [
    createMcpExtension({ tools: mcp.tools }),
    createImageGenerationExtension({
      artifactService: services.artifactService,
      attachmentService: services.attachmentService,
      conversationId: options.conversationId,
      getRunId: () => runContext.current?.runId,
      imageGenerationGateway: services.imageGenerationGateway,
    }),
    createImageTransformExtension({
      conversationId: options.conversationId,
      getRunId: () => runContext.current?.runId,
      service: services.imageTransformService,
    }),
    createArtifactExtension({
      artifactService: services.artifactService,
      conversationId: options.conversationId,
      cwd: options.canonicalRoot,
      getRunId: () => runContext.current?.runId,
      grants: options.grants,
      scratchGrant,
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
      approvalService: services.approvalService,
      classifyTool,
      cwd: options.canonicalRoot,
      executionProfile: options.executionProfile,
      getGrants: () => options.grants,
      getRunContext: () => runContext.current,
    }),
    createChangeCaptureExtension({
      canonicalRoot: options.canonicalRoot,
      conversationId: options.conversationId,
      getRunContext: () => runContext.current,
      service: services.changeCaptureService,
    }),
  )
  inProcessExtensions.push(createSystemPromptExtension({
    artifactService: services.artifactService,
    conversationId: options.conversationId,
  }))

  return {
    getServiceTier: () => runContext.current?.serviceTier ?? null,
    inProcessExtensions,
    runContext,
  }
}

interface BuddyToolClassifierOptions {
  automationService: CreateAutomationToolOptions['service']
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

    const artifact = classifyArtifactTool(event)
    if (artifact)
      return artifact

    const imageTransform = classifyImageTransformTool(event)
    if (imageTransform)
      return imageTransform

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
