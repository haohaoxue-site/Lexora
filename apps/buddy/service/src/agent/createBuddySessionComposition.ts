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
import type {
  BuddyRunContext,
  CreateToolPolicyExtensionOptions,
  ToolApprovalGateway,
} from './extensions/toolPolicyExtension'
import { classifyArtifactPresentTool } from '../artifacts/artifactToolContract'
import { classifyAutomationToolCall } from '../automations/createAutomationTool'
import { classifyMcpTool } from '../connectors/mcp/mcpToolContract'
import { classifyImageGenerationTool } from '../images/imageGenerationToolContract'
import { classifyPetTool } from '../pet/petToolContract'
import { SystemCapabilityService } from '../system/systemCapability'
import { classifySystemTool } from '../system/systemToolContract'
import { createArtifactExtension } from './extensions/artifactExtension'
import { createAutomationExtension } from './extensions/automationExtension'
import { createChangeCaptureExtension } from './extensions/changeCaptureExtension'
import { createImageGenerationExtension } from './extensions/imageGenerationExtension'
import { createMcpExtension } from './extensions/mcpExtension'
import { createPetExtension } from './extensions/petExtension'
import { createSystemExtension } from './extensions/systemExtension'
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
  onAutomationChanged: (automationId: string) => void
  petService: CreatePetToolOptions['service']
  systemHost: SystemHostPort
}

export interface CreateBuddySessionCompositionOptions {
  canonicalRoot: string
  conversationId: string
  executionProfile: BuddyExecutionProfile
  grant: ProjectGrant
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
    createArtifactExtension({
      artifactService: services.artifactService,
      canonicalRoot: options.canonicalRoot,
      conversationId: options.conversationId,
      getRunId: () => runContext.current?.runId,
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
      getGrants: () => [options.grant],
      getRunContext: () => runContext.current,
    }),
    createChangeCaptureExtension({
      canonicalRoot: options.canonicalRoot,
      conversationId: options.conversationId,
      getRunContext: () => runContext.current,
      service: services.changeCaptureService,
    }),
  )

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

    const artifact = classifyArtifactPresentTool(event)
    if (artifact)
      return artifact

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
