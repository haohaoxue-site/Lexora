import type { BuddyExecutionProfile } from '../../../shared/executionProfile'
import type { BuddyServiceTier } from '../../../shared/modelSelection'
import type { BuddySessionMode } from '../../../shared/sessionMode'
import type { CreateAutomationToolOptions } from '../automations/createAutomationTool'
import type { BuddyMcpTools } from '../connectors/mcp/McpConnectorService'
import type { ImageGenerationGateway } from '../images/ImageGenerationGateway'
import type { CreatePetToolOptions } from '../pet/createPetTool'
import type { ProjectGrant } from '../projects/resolveGrantedPath'
import type { SystemHostPort } from '../system/systemCapability'
import type { BuddyInProcessExtension } from './createBuddyResourceLoader'
import type { BuddyRunContextStore } from './createReusableBuddySession'
import type { CreateImageGenerationExtensionOptions } from './extensions/imageGenerationExtension'
import type { ToolApprovalGateway } from './extensions/toolPolicyExtension'
import { classifyAutomationToolCall } from '../automations/createAutomationTool'
import { classifyMcpTool } from '../connectors/mcp/mcpToolContract'
import { classifyImageGenerationTool } from '../images/imageGenerationToolContract'
import { classifyPetTool } from '../pet/petToolContract'
import { SystemCapabilityService } from '../system/systemCapability'
import { classifySystemTool } from '../system/systemToolContract'
import { createAutomationExtension } from './extensions/automationExtension'
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
  attachmentService: CreateImageGenerationExtensionOptions['attachmentService']
  automationService: CreateAutomationToolOptions['service']
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

  return {
    getServiceTier: () => runContext.current?.serviceTier ?? null,
    inProcessExtensions: [
      createMcpExtension({ tools: mcp.tools }),
      createImageGenerationExtension({
        artifactService: services.artifactService,
        attachmentService: services.attachmentService,
        conversationId: options.conversationId,
        getRunId: () => runContext.current?.runId,
        imageGenerationGateway: services.imageGenerationGateway,
      }),
      createPetExtension({
        getRunId: () => runContext.current?.runId,
        service: services.petService,
      }),
      createSystemExtension({ service: systemCapability }),
      ...(options.sessionMode === 'interactive'
        ? [createAutomationExtension({
            onChanged: services.onAutomationChanged,
            service: services.automationService,
          })]
        : []),
      createToolPolicyExtension({
        approvalService: services.approvalService,
        classifyTool: async (event, activeRun) => classifyAutomationToolCall(
          services.automationService,
          event,
        ) ?? await classifySystemTool(
          systemCapability,
          event,
          activeRun.signal,
        ) ?? classifyImageGenerationTool(event)
        ?? classifyPetTool(event)
        ?? classifyMcpTool(mcp.classifications, event)
        ?? {},
        cwd: options.canonicalRoot,
        executionProfile: options.executionProfile,
        getGrants: () => [options.grant],
        getRunContext: () => runContext.current,
      }),
    ],
    runContext,
  }
}
