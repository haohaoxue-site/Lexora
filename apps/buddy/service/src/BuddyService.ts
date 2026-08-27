import type { DatabaseSync } from 'node:sqlite'
import type {
  Automation,
  AutomationModelTarget,
  AutomationStartupContext,
} from '../../shared/automation'
import type {
  BuddyServiceTier,
  BuddyThinkingLevel,
} from '../../shared/modelSelection'
import type { BuddyAgentSessionLike } from './agent/BuddyAgentRunner'
import type { CreateBuddySessionOptions } from './agent/createBuddySession'
import type {
  BuddyRunContext,
  BuddyToolClassification,
} from './agent/extensions/toolPolicyExtension'
import type { ResolvedAutomationModel } from './automations/AutomationDispatcher'
import type { AutomationClock } from './automations/AutomationScheduleEvaluator'
import type { BuddyRunEvent } from './events/RunEventLog'
import type { ImageGenerationGateway } from './images/ImageGenerationGateway'
import type { BuddyServiceRpcServer } from './rpc/BuddyServiceRpcServer'
import type { ApprovalRecord, ApprovalStatus } from './storage/approvalRepository'
import type { ArtifactRecord } from './storage/artifactRepository'
import type { AttachmentRecord } from './storage/attachmentRepository'
import type { AutomationOccurrenceRecord } from './storage/automationRepository'
import type { McpServerRecord } from './storage/connectorRepository'
import type { ProjectRecord } from './storage/projectRepository'
import type { RunRecord } from './storage/runRepository'
import type { UsageRecord } from './storage/usageRepository'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, realpath } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { getSupportedThinkingLevels } from '@earendil-works/pi-ai'
import { z } from 'zod'
import { buddyAttachmentImportRequestSchema } from '../../shared/attachmentPolicy'
import {
  automationMutationRequestSchemas,
  automationPreviewRequestSchema,
  automationRequestSchemas,
} from '../../shared/automation'
import {
  materializeBuddyPromptCommand,
  parseBuddyChatCommand,
} from '../../shared/buddyChatCommands'
import { BUDDY_EXECUTION_PROFILES } from '../../shared/executionProfile'
import {
  BUDDY_SERVICE_TIERS,
  BUDDY_THINKING_LEVELS,
  isBuddyThinkingLevel,
  resolveBuddyServiceTiers,
} from '../../shared/modelSelection'
import { toPublicRunEvent } from '../../shared/publicRunEvent'
import { buddyRunOutputPayloadSchema } from '../../shared/runOutput'
import { BuddyAgentRunner } from './agent/BuddyAgentRunner'
import { BuddySessionRegistry } from './agent/BuddySessionRegistry'
import { resolveBuddySessionResources } from './agent/BuddySessionResources'
import { BuddyTurnLauncher } from './agent/BuddyTurnLauncher'
import { createBuddyRecoveryMessages } from './agent/createBuddyRecoveryMessages'
import {
  createBuddyContextSnapshot,
  createBuddySession,
} from './agent/createBuddySession'
import { createReusableBuddySession } from './agent/createReusableBuddySession'
import { createAutomationExtension } from './agent/extensions/automationExtension'
import {
  createImageGenerationExtension,
  IMAGE_GENERATION_TOOL_CLASSIFICATION,
  IMAGE_GENERATION_TOOL_NAME,
} from './agent/extensions/imageGenerationExtension'
import { createMcpExtension } from './agent/extensions/mcpExtension'
import { createPetExtension } from './agent/extensions/petExtension'
import { classifySystemTool, createSystemExtension } from './agent/extensions/systemExtension'
import { createToolPolicyExtension } from './agent/extensions/toolPolicyExtension'
import { inspectCommittedPiCompaction } from './agent/inspectCommittedPiCompaction'
import {
  BuddySkillSelectionError,
  formatBuddySkillPrompt,
  SkillService,
} from './agent/SkillService'
import { ApprovalService } from './approvals/ApprovalService'
import { ArtifactService } from './artifacts/ArtifactService'
import { AttachmentService } from './attachments/AttachmentService'
import { AutomationDispatcher } from './automations/AutomationDispatcher'
import { AutomationOccurrenceLifecycleService } from './automations/AutomationOccurrenceLifecycleService'
import {
  previewAutomationSchedule,
  systemAutomationClock,
} from './automations/AutomationScheduleEvaluator'
import { AutomationScheduler } from './automations/AutomationScheduler'
import { AutomationService } from './automations/AutomationService'
import { classifyAutomationToolCall } from './automations/createAutomationTool'
import {
  HostConnectorSecretStore,
  McpConnectorService,
} from './connectors/mcp/McpConnectorService'
import { connectorCredentialSchema } from './connectors/mcp/mcpSchemas'
import { ConversationLifecycleService } from './conversations/ConversationLifecycleService'
import {
  createConversationTimelineCursor,
  parseConversationTimelineCursor,
} from './conversations/conversationTimelineCursor'
import {
  createMessagePageCursor,
  parseMessagePageCursor,
} from './conversations/messagePageCursor'
import { OpenAiImageGenerationService } from './images/OpenAiImageGenerationService'
import { AttentionNotificationService } from './notifications/AttentionNotificationService'
import { PET_TOOL_CLASSIFICATION, PET_TOOL_NAME } from './pet/createPetTool'
import { PetActionService } from './pet/PetActionService'
import { ProjectGrantService } from './projects/ProjectGrantService'
import { resolveGrantedPath } from './projects/resolveGrantedPath'
import {
  customProviderInputSchema,
  defaultModelSchema,
  modelParametersOverrideSchema,
  providerModelInputSchema,
} from './providers/providerSchemas'
import { createProviderService } from './providers/ProviderService'
import { readBoundedFile } from './resources/BoundedFileReader'
import { createApprovalRepository } from './storage/approvalRepository'
import { createArtifactRepository } from './storage/artifactRepository'
import { createAttachmentRepository } from './storage/attachmentRepository'
import { BuddyDataPaths } from './storage/BuddyDataPaths'
import { createCommandRequestRepository } from './storage/commandRequestRepository'
import { createConnectorRepository } from './storage/connectorRepository'
import { createConversationRepository } from './storage/conversationRepository'
import { createNotificationAttentionRepository } from './storage/notificationAttentionRepository'
import { createProjectRepository } from './storage/projectRepository'
import { createProviderRepository } from './storage/providerRepository'
import { createRunInputRepository } from './storage/runInputRepository'
import { createRunRepository } from './storage/runRepository'
import { createTurnRequestRepository } from './storage/turnRequestRepository'
import { createUsageRepository } from './storage/usageRepository'
import { createWorkspaceRepository } from './storage/workspaceRepository'
import { LinuxSystemHost } from './system/LinuxSystemHost'
import { SystemCapabilityService } from './system/systemCapability'
import { UsageService } from './usage/UsageService'

const WORKSPACE_STATE_KEY = 'buddy.chat.workspace.v1'
const MAX_CONTEXT_FILE_BYTES = 1024 * 1024
const MAX_MODEL_INPUT_BYTES = 4 * 1024 * 1024

const idSchema = z.string().trim().min(1).max(256)
const sessionIdentitySchema = z.string().regex(/^[A-Z0-9][\w-]{0,127}$/i)
const limitSchema = z.number().int().positive().max(500).optional()
const eventLimitSchema = z.number().int().positive().max(1_000).optional()
const executionProfileSchema = z.enum(BUDDY_EXECUTION_PROFILES)
const emptySchema = z.object({}).strict()
const connectorConfigSchema = z.discriminatedUnion('transport', [
  z.object({
    args: z.array(z.string().max(4096)).max(128),
    command: z.string().trim().min(1).max(4096),
    cwd: z.string().nullable(),
    enabled: z.boolean(),
    id: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
    name: z.string().trim().min(1).max(128),
    transport: z.literal('stdio'),
  }).strict(),
  z.object({
    enabled: z.boolean(),
    id: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
    name: z.string().trim().min(1).max(128),
    transport: z.literal('streamable-http'),
    url: z.url(),
  }).strict(),
])
const connectorCredentialMutationSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('keep') }).strict(),
  z.object({ mode: z.literal('clear') }).strict(),
  z.object({ mode: z.literal('replace'), value: connectorCredentialSchema }).strict(),
])
const modelSelectionSchema = z.object({
  modelId: idSchema,
  providerId: idSchema,
  reasoning: z.enum(BUDDY_THINKING_LEVELS).nullable(),
  serviceTier: z.enum(BUDDY_SERVICE_TIERS).nullable(),
}).strict()
const startTurnSchema = z.object({
  attachmentIds: z.array(idSchema).max(16),
  branchId: sessionIdentitySchema.nullable(),
  content: z.string().max(2 * 1024 * 1024),
  contextItems: z.array(z.object({
    kind: z.enum(['file', 'skill', 'slashCommand']),
    value: z.string().min(1),
  }).strict()).max(64),
  conversationId: sessionIdentitySchema.nullable(),
  draftId: sessionIdentitySchema,
  executionProfile: executionProfileSchema,
  modelSelection: modelSelectionSchema.nullable(),
  projectId: idSchema.nullable(),
  requestId: z.string().min(1).max(128),
}).strict().refine(
  value => value.content.trim().length > 0 || value.attachmentIds.length > 0,
).refine(value => new Set(value.attachmentIds).size === value.attachmentIds.length)
const regenerateAssistantSchema = z.object({
  assistantMessageId: idSchema,
  conversationId: idSchema,
  requestId: z.string().min(1).max(128),
}).strict()
const editUserMessageSchema = z.object({
  attachmentIds: z.array(idSchema).max(16),
  content: z.string().max(2 * 1024 * 1024),
  contextItems: z.array(z.object({
    kind: z.enum(['file', 'skill', 'slashCommand']),
    value: z.string().min(1),
  }).strict()).max(64),
  conversationId: idSchema,
  draftId: sessionIdentitySchema,
  modelSelection: modelSelectionSchema.nullable(),
  requestId: z.string().min(1).max(128),
  userMessageId: idSchema,
}).strict().refine(
  value => value.content.trim().length > 0 || value.attachmentIds.length > 0,
).refine(value => new Set(value.attachmentIds).size === value.attachmentIds.length)
const chatCommandSchema = z.object({
  arguments: z.string().max(4_096),
  branchId: sessionIdentitySchema,
  command: z.literal('compact'),
  conversationId: sessionIdentitySchema,
  requestId: z.string().min(1).max(128),
}).strict()
const contextUsageSnapshotRequestSchema = z.object({
  branchId: sessionIdentitySchema.nullable(),
  conversationId: sessionIdentitySchema.nullable(),
  draftId: sessionIdentitySchema,
  executionProfile: executionProfileSchema,
  modelSelection: modelSelectionSchema,
  projectId: idSchema.nullable(),
}).strict().refine(input => (
  (input.conversationId === null) === (input.branchId === null)
))

export interface StartBuddyServiceOptions {
  automationClock?: AutomationClock
  automationStartupContext?: AutomationStartupContext
  buddyHome: string
  builtinSkillsDirectory: string
  database: DatabaseSync
  rpc: BuddyServiceRpcServer
  eventLog: import('./events/RunEventLog').RunEventLog
}

export interface BuddyServiceHandle {
  dispose: () => Promise<void>
}

export async function startBuddyService(
  options: StartBuddyServiceOptions,
): Promise<BuddyServiceHandle> {
  const paths = new BuddyDataPaths(options.buddyHome)
  const agentDirectory = join(options.buddyHome, 'agent')
  await Promise.all([
    mkdir(agentDirectory, { mode: 0o700, recursive: true }),
    mkdir(paths.conversationsDirectory, { mode: 0o700, recursive: true }),
    mkdir(paths.draftsDirectory, { mode: 0o700, recursive: true }),
  ])

  const projectsRepository = createProjectRepository(options.database)
  const conversations = createConversationRepository(options.database)
  const runs = createRunRepository(options.database)
  const runInputs = createRunInputRepository(options.database)
  const approvalsRepository = createApprovalRepository(options.database)
  const usageRepository = createUsageRepository(options.database)
  const workspace = createWorkspaceRepository(options.database)
  const turnRequests = createTurnRequestRepository(options.database)
  const commandRequests = createCommandRequestRepository(options.database)
  const connectorsRepository = createConnectorRepository(options.database)
  const projectService = new ProjectGrantService(projectsRepository)
  let runner!: BuddyAgentRunner
  const approvalService = new ApprovalService({
    eventLog: options.eventLog,
    onExpired: async (runId) => {
      await runner.cancel(runId, 'AUTOMATION_APPROVAL_EXPIRED')
    },
    repository: approvalsRepository,
  })
  const usageService = new UsageService({
    eventLog: options.eventLog,
    repository: usageRepository,
  })
  const attachmentService = new AttachmentService({
    paths,
    repository: createAttachmentRepository(options.database),
  })
  const artifactsRepository = createArtifactRepository(options.database)
  const artifactService = new ArtifactService({ paths, repository: artifactsRepository })
  const providersRepository = createProviderRepository(options.database)
  const providerService = await createProviderService({
    agentDirectory,
    database: options.database,
    getActiveRuns: () => runs.listIncomplete(),
    peer: options.rpc,
    providers: providersRepository,
  })
  const imageGenerationGateway = new OpenAiImageGenerationService({
    modelRuntime: providerService.getSessionRuntime(),
  })
  const systemHost = new LinuxSystemHost()
  const sessions = new BuddySessionRegistry<BuddyAgentSessionLike>()
  const connectorService = new McpConnectorService({
    connectors: connectorsRepository,
    invalidateSessions: () => sessions.invalidateAll(),
    notify: event => options.rpc.notify(event.type, event),
    secrets: new HostConnectorSecretStore(options.rpc),
  })
  const skillService = new SkillService({
    agentDirectory,
    builtinSkillsDirectory: options.builtinSkillsDirectory,
    projects: projectsRepository,
  })
  const petService = new PetActionService({
    eventSink: event => options.eventLog.append(event),
    peer: options.rpc,
  })
  const automationClock = options.automationClock ?? systemAutomationClock
  const automationService = new AutomationService({
    clock: automationClock,
    database: options.database,
  })
  const notificationService = new AttentionNotificationService({
    attention: createNotificationAttentionRepository(options.database),
    listAutomationRuns: () => automationService.listHistory({ limit: 100 }).items.flatMap(
      (occurrence) => {
        if (!occurrence.runId || !occurrence.conversationId)
          return []
        const run = runs.findById(occurrence.runId)
        if (!run?.completedAt || (run.status !== 'completed' && run.status !== 'failed'))
          return []
        return [{
          automationId: occurrence.automationId,
          automationName: occurrence.executionSnapshot.name,
          completedAt: run.completedAt,
          conversationId: occurrence.conversationId,
          errorCode: run.errorCode,
          runId: run.id,
          status: run.status,
        }]
      },
    ),
    listModels: () => providersRepository.listModelStates(),
  })
  let automationScheduler: AutomationScheduler | null = null
  const notifyAutomationToolChanged = (automationId: string) => {
    options.rpc.notify('automation.changed', { automationId })
    void automationScheduler?.wake()
  }
  runner = new BuddyAgentRunner({
    cancelPendingApprovals: () => approvalService.cancelPendingApprovals(),
    conversations,
    eventLog: options.eventLog,
    inspectCommittedCompaction: run => inspectCommittedPiCompaction({
      branchId: run.branchId,
      conversationsDirectory: paths.conversationsDirectory,
      conversationId: run.conversationId,
      piSessionFile: requireValue(run.piSessionFile, 'VALIDATION_FAILED'),
      startedAt: run.startedAt,
    }),
    runs,
    sessions,
    usage: usageService,
    sessionFactory: async (input) => {
      const run = requireValue(runs.findById(input.runId), 'VALIDATION_FAILED')
      const conversation = requireValue(
        conversations.findById(input.conversationId),
        'VALIDATION_FAILED',
      )
      if (conversation.deletedAt !== null)
        throw new BuddyServiceError('VALIDATION_FAILED')
      const project = conversation.projectId
        ? requireActiveProject(projectsRepository.findById(conversation.projectId))
        : null
      await providerService.assertModelAvailable(run.provider, run.model)
      const selectedModel = providerService.resolveModelWithParameters(
        run.provider,
        run.model,
        run.contextWindow,
        run.maxTokens,
      )
      const mcp = await connectorService.getTools(input.signal)
      const runContext: { current: BuddyRunContext | null } = { current: null }
      const systemCapability = new SystemCapabilityService({ host: systemHost })
      const missingRecoveryAttachmentIds = new Set<string>()
      let recoveredImageCount = 0
      const classifications = new Map<string, BuddyToolClassification>(mcp.classifications)
      classifications.set(PET_TOOL_NAME, PET_TOOL_CLASSIFICATION)
      classifications.set(IMAGE_GENERATION_TOOL_NAME, IMAGE_GENERATION_TOOL_CLASSIFICATION)
      const grant = project
        ? {
            canonicalRoot: project.canonicalRoot,
            projectId: project.id,
            root: project.root,
          }
        : {
            canonicalRoot: input.canonicalRoot,
            projectId: input.conversationId,
            root: input.canonicalRoot,
          }
      const session = await createBuddySession({
        agentDir: agentDirectory,
        branchId: input.branchId,
        canonicalRoot: input.canonicalRoot,
        conversationsDirectory: paths.conversationsDirectory,
        conversationId: input.conversationId,
        cwd: input.canonicalRoot,
        executionProfile: run.executionProfile,
        getServiceTier: () => runContext.current?.serviceTier ?? null,
        model: selectedModel,
        modelRuntime: providerService.getSessionRuntime(),
        inProcessExtensions: [
          createMcpExtension({ tools: mcp.tools }),
          createImageGenerationExtension({
            artifactService,
            attachmentService,
            conversationId: input.conversationId,
            getRunId: () => runContext.current?.runId,
            imageGenerationGateway,
          }),
          createPetExtension({
            getRunId: () => runContext.current?.runId,
            service: petService,
          }),
          createSystemExtension({ service: systemCapability }),
          ...(input.sessionMode === 'interactive'
            ? [createAutomationExtension({
                onChanged: notifyAutomationToolChanged,
                service: automationService,
              })]
            : []),
          createToolPolicyExtension({
            approvalService,
            classifyTool: async (event, activeRun) => classifyAutomationToolCall(
              automationService,
              event,
            ) ?? await classifySystemTool(
              systemCapability,
              event,
              activeRun.signal,
            ) ?? classifications.get(event.toolName) ?? {},
            cwd: input.canonicalRoot,
            executionProfile: run.executionProfile,
            getGrants: () => [grant],
            getRunContext: () => runContext.current,
          }),
        ],
        piSessionFile: input.piSessionFile ?? undefined,
        recoveryMessages: async () => {
          const history = conversations.listBranchMessages(input.conversationId, input.branchId)
          const recoveredUserInputs = new Map<string, {
            images: Awaited<ReturnType<AttachmentService['materializeRecoveryImages']>>['images']
            prompt: string
          }>()
          for (const message of history) {
            if (message.id === run.triggeringMessageId)
              break
            if (message.role !== 'user')
              continue
            const storedInput = runInputs.findByTriggeringMessageId(message.id)
            if (!storedInput)
              continue
            const recovery = await attachmentService.materializeRecoveryImages(
              storedInput.attachmentIds,
              input.conversationId,
            )
            recoveredImageCount += recovery.images.length
            for (const attachmentId of recovery.missingAttachmentIds)
              missingRecoveryAttachmentIds.add(attachmentId)
            recoveredUserInputs.set(message.id, {
              images: recovery.images,
              prompt: storedInput.prompt,
            })
          }
          return createBuddyRecoveryMessages({
            fallbackModel: selectedModel,
            messages: history,
            resolveRunModel: (runId) => {
              const historicalRun = runs.findById(runId)
              if (!historicalRun)
                return null
              try {
                return providerService.resolveModelWithParameters(
                  historicalRun.provider,
                  historicalRun.model,
                  historicalRun.contextWindow,
                  historicalRun.maxTokens,
                )
              }
              catch {
                return null
              }
            },
            resolveUserInput: messageId => recoveredUserInputs.get(messageId) ?? null,
            triggeringMessageId: run.triggeringMessageId,
          })
        },
        resources: input.resources,
        thinkingLevel: input.thinkingLevel,
      })
      return {
        piSessionFile: session.piSessionFile,
        recoveredFromProductHistory: session.recoveredFromProductHistory,
        recoveryDegradation: session.recoveredFromProductHistory
          && missingRecoveryAttachmentIds.size > 0
          ? {
              missingAttachmentIds: [...missingRecoveryAttachmentIds],
              recoveredImageCount,
            }
          : undefined,
        session: createReusableBuddySession({
          assertModelAccess: async (provider, model, contextWindow, maxTokens) => {
            await providerService.assertModelAvailable(provider, model)
            return providerService.resolveModelWithParameters(
              provider,
              model,
              contextWindow,
              maxTokens,
            )
          },
          runContext,
          session: session.session,
          shutdown: session.shutdown,
        }),
      }
    },
  })
  const conversationLifecycle = new ConversationLifecycleService({
    conversations,
    runner,
    sessions,
  })
  const automationOccurrenceLifecycle = new AutomationOccurrenceLifecycleService({
    automations: automationService,
    conversationLifecycle,
    notifications: notificationService,
  })
  const turnLauncher = new BuddyTurnLauncher(runner)
  const automationDispatcher = new AutomationDispatcher({
    automationService,
    cancelRun: (runId, errorCode) => runner.cancel(runId, errorCode),
    clock: automationClock,
    database: options.database,
    launchTurn: input => turnLauncher.startTurn(input),
    resolveConversationWorkspace: async (conversationId) => {
      const workspace = paths.conversationWorkspace(conversationId)
      await mkdir(workspace, { mode: 0o700, recursive: true })
      return realpath(workspace)
    },
    resolveModel: target => resolveAutomationModel(providerService, target),
    resolveProject: async (projectId) => {
      const project = projectsRepository.findById(projectId)
      return project && project.revokedAt === null
        ? toResolvedAutomationProject(project)
        : null
    },
    resolveResources: ({ canonicalRoot, project }) => resolveBuddySessionResources({
      canonicalRoot,
      cwd: canonicalRoot,
      projectInstructions: project?.instructions,
      projectId: project?.id ?? null,
      skills: skillService,
    }),
  })
  const scheduler = new AutomationScheduler({
    automationService,
    clock: automationClock,
    dispatch: async (occurrence) => {
      await automationDispatcher.dispatch(occurrence)
      options.rpc.notify('automation.changed', { automationId: occurrence.automationId })
    },
    onChanged: automationId => options.rpc.notify('automation.changed', { automationId }),
    workspace,
  })
  automationScheduler = scheduler

  for (const automation of reconcileAutomationDependencies({
    automationService,
    projectsRepository,
    providersRepository,
  })) {
    options.rpc.notify('automation.changed', { automationId: automation.id })
  }
  await conversationLifecycle.recoverPendingDeletions()
  await runner.recoverInterruptedRuns()
  await options.eventLog.compactTerminalRuns()

  const unregister = registerRuntimeHandlers({
    agentDirectory,
    approvalService,
    approvalsRepository,
    artifactService,
    artifactsRepository,
    attachmentService,
    automationClock,
    automationOccurrenceLifecycle,
    automationScheduler: scheduler,
    automationService,
    connectorService,
    connectorsRepository,
    commandRequests,
    conversations,
    conversationLifecycle,
    eventLog: options.eventLog,
    imageGenerationGateway,
    notificationService,
    paths,
    petService,
    projectService,
    projectsRepository,
    providerService,
    rpc: options.rpc,
    runner,
    runs,
    runInputs,
    sessions,
    skillService,
    systemHost,
    usageRepository,
    turnRequests,
    turnLauncher,
    workspace,
  })
  await scheduler.start(options.automationStartupContext ?? {
    reason: 'normal',
    restoreToken: null,
  })
  return {
    async dispose() {
      await scheduler.dispose()
      unregister()
      await Promise.allSettled([
        runner.dispose(),
        connectorService.close(),
      ])
    },
  }
}

interface RuntimeServices {
  agentDirectory: string
  approvalService: ApprovalService
  approvalsRepository: ReturnType<typeof createApprovalRepository>
  artifactService: ArtifactService
  artifactsRepository: ReturnType<typeof createArtifactRepository>
  attachmentService: AttachmentService
  automationClock: AutomationClock
  automationOccurrenceLifecycle: AutomationOccurrenceLifecycleService
  automationScheduler: AutomationScheduler
  automationService: AutomationService
  connectorService: McpConnectorService
  connectorsRepository: ReturnType<typeof createConnectorRepository>
  commandRequests: ReturnType<typeof createCommandRequestRepository>
  conversations: ReturnType<typeof createConversationRepository>
  conversationLifecycle: ConversationLifecycleService
  eventLog: import('./events/RunEventLog').RunEventLog
  imageGenerationGateway: ImageGenerationGateway
  notificationService: AttentionNotificationService
  paths: BuddyDataPaths
  petService: PetActionService
  projectService: ProjectGrantService
  projectsRepository: ReturnType<typeof createProjectRepository>
  providerService: Awaited<ReturnType<typeof createProviderService>>
  rpc: BuddyServiceRpcServer
  runner: BuddyAgentRunner
  runs: ReturnType<typeof createRunRepository>
  runInputs: ReturnType<typeof createRunInputRepository>
  sessions: BuddySessionRegistry<BuddyAgentSessionLike>
  skillService: SkillService
  systemHost: LinuxSystemHost
  usageRepository: ReturnType<typeof createUsageRepository>
  turnRequests: ReturnType<typeof createTurnRequestRepository>
  turnLauncher: BuddyTurnLauncher
  workspace: ReturnType<typeof createWorkspaceRepository>
}

function registerRuntimeHandlers(services: RuntimeServices): () => void {
  const disposers: Array<() => void> = []
  const on = (method: string, handler: (params: unknown) => Promise<unknown> | unknown) => {
    disposers.push(services.rpc.onRequest(method, handler))
  }
  disposers.push(services.rpc.onNotification((method, params) => {
    if (method !== 'scheduler.wake')
      return
    const wake = z.object({
      reason: z.enum(['resume', 'unlock-screen']),
    }).strict().safeParse(params)
    if (wake.success)
      void services.automationScheduler.wake()
  }))
  const publicRun = (run: RunRecord) => toPublicRun(
    run,
    services.runInputs.findByRunId(run.id)?.reasoning ?? null,
  )
  const turnStart = (
    request: { branchId: string, conversationId: string, runId: string },
    run: RunRecord,
  ) => ({
    branchId: request.branchId,
    conversationId: request.conversationId,
    run: publicRun(run),
    runId: request.runId,
  })

  on('automations.preview', (params) => {
    const input = parse(automationPreviewRequestSchema, params)
    return previewAutomationSchedule(input, services.automationClock)
  })
  on('automations.list', (params) => {
    const input = parse(automationRequestSchemas.list, params)
    const page = services.automationService.list(input)
    return {
      ...page,
      items: page.items.map((automation) => {
        const occurrence = services.automationService.getActiveOccurrence(automation.id)
        return {
          ...automation,
          activeOccurrence: occurrence
            ? toAutomationOccurrenceView(services, occurrence)
            : null,
        }
      }),
    }
  })
  on('automations.get', (params) => {
    const input = parse(automationRequestSchemas.get, params)
    const automation = services.automationService.get(input.automationId)
    if (!automation)
      throw new BuddyServiceError('AUTOMATION_NOT_FOUND')
    return automation
  })
  on('automations.create', (params) => {
    const automation = services.automationService.create(
      parse(automationMutationRequestSchemas.create, params),
    )
    notifyAutomationChanged(services, automation.id)
    return automation
  })
  on('automations.update', (params) => {
    const automation = services.automationService.update(
      parse(automationMutationRequestSchemas.update, params),
    )
    notifyAutomationChanged(services, automation.id)
    return automation
  })
  on('automations.pause', (params) => {
    const automation = services.automationService.pause(
      parse(automationMutationRequestSchemas.pause, params),
    )
    notifyAutomationChanged(services, automation.id)
    return automation
  })
  on('automations.resume', (params) => {
    const automation = services.automationService.resume(
      parse(automationMutationRequestSchemas.resume, params),
    )
    notifyAutomationChanged(services, automation.id)
    return automation
  })
  on('automations.delete', (params) => {
    const automation = services.automationService.delete(
      parse(automationMutationRequestSchemas.delete, params),
    )
    notifyAutomationChanged(services, automation.id)
    return automation
  })
  on('automations.runNow', (params) => {
    const result = services.automationService.runNow(
      parse(automationMutationRequestSchemas.runNow, params),
    )
    if (result.outcome === 'started')
      notifyAutomationChanged(services, result.occurrence.automationId)
    return result
  })
  on('automations.listOccurrences', (params) => {
    const input = parse(automationRequestSchemas.listOccurrences, params)
    const page = services.automationService.listHistory(input)
    return {
      ...page,
      items: page.items.map(occurrence => toAutomationOccurrenceView(services, occurrence)),
    }
  })
  on('automations.deleteOccurrence', async (params) => {
    const input = parse(automationRequestSchemas.deleteOccurrence, params)
    const result = await services.automationOccurrenceLifecycle.deleteOccurrence(input.occurrenceId)
    if (result.automationId)
      notifyAutomationChanged(services, result.automationId)
    return result.deleted
  })

  on('providers.list', async (params) => {
    parse(emptySchema, params)
    return services.providerService.listProviders()
  })
  on('providers.add', async (params) => {
    const input = parse(z.object({ providerId: idSchema }).strict(), params)
    return services.providerService.addProvider(input.providerId)
  })
  on('providers.listModels', async (params) => {
    const input = parse(z.object({ providerId: idSchema.nullable().optional() }).strict(), params)
    const models = await services.providerService.listModels(input.providerId ?? undefined)
    return models.map(model => toLocalRuntimeModelOption(services.providerService, model))
  })
  on('providers.getDefaultModel', (params) => {
    parse(emptySchema, params)
    return services.providerService.getDefaultModel()
  })
  on('providers.login', async (params) => {
    const input = parse(z.object({
      authType: z.enum(['api_key', 'oauth']),
      providerId: idSchema,
    }).strict(), params)
    await services.providerService.login(input.providerId, input.authType)
    return ok()
  })
  on('providers.respondToAuth', async (params) => {
    const input = parse(z.object({ challengeId: z.uuid(), value: z.string() }).strict(), params)
    await services.providerService.respondToPrompt(input.challengeId, input.value)
    return ok()
  })
  on('providers.cancelAuth', async (params) => {
    const input = parse(z.object({ challengeId: z.uuid() }).strict(), params)
    await services.providerService.cancelLogin(input.challengeId)
    return ok()
  })
  on('providers.logout', async (params) => {
    const input = parse(z.object({ providerId: idSchema }).strict(), params)
    await services.providerService.logout(input.providerId)
    blockPinnedAutomations(services, input.providerId)
    await services.sessions.invalidateAll()
    return ok()
  })
  on('providers.clearCredential', async (params) => {
    const input = parse(z.object({ providerId: idSchema }).strict(), params)
    await services.providerService.clearCredential(input.providerId)
    blockPinnedAutomations(services, input.providerId)
    await services.sessions.invalidateAll()
    return ok()
  })
  on('providers.remove', async (params) => {
    const input = parse(z.object({ providerId: idSchema }).strict(), params)
    await services.providerService.removeProvider(input.providerId)
    blockPinnedAutomations(services, input.providerId)
    await services.sessions.invalidateAll()
    return ok()
  })
  on('providers.setEnabled', async (params) => {
    const input = parse(z.object({ enabled: z.boolean(), providerId: idSchema }).strict(), params)
    const provider = await services.providerService.setProviderEnabled(
      input.providerId,
      input.enabled,
    )
    if (!input.enabled)
      blockPinnedAutomations(services, input.providerId)
    await services.sessions.invalidateAll()
    return provider
  })
  on('providers.setModelEnabled', async (params) => {
    const input = parse(z.object({
      enabled: z.boolean(),
      modelId: idSchema,
      providerId: idSchema,
    }).strict(), params)
    const model = await services.providerService.setModelEnabled(
      input.providerId,
      input.modelId,
      input.enabled,
    )
    if (!input.enabled)
      blockPinnedAutomations(services, input.providerId, input.modelId)
    await services.sessions.invalidateAll()
    return toLocalRuntimeModelOption(services.providerService, model)
  })
  on('providers.setModelParameters', (params) => {
    const input = parse(z.object({
      modelId: idSchema,
      parameters: modelParametersOverrideSchema,
      providerId: idSchema,
    }).strict(), params)
    return services.providerService.setModelParametersOverride(
      input.providerId,
      input.modelId,
      input.parameters,
    ).then(model => toLocalRuntimeModelOption(services.providerService, model))
  })
  on('providers.acknowledgeModelSourceUpdate', (params) => {
    const input = parse(z.object({ modelId: idSchema, providerId: idSchema }).strict(), params)
    return services.providerService.acknowledgeModelSourceUpdate(
      input.providerId,
      input.modelId,
    ).then(model => toLocalRuntimeModelOption(services.providerService, model))
  })
  on('providers.restoreModelSourceParameters', (params) => {
    const input = parse(z.object({ modelId: idSchema, providerId: idSchema }).strict(), params)
    return services.providerService.restoreModelSourceParameters(
      input.providerId,
      input.modelId,
    ).then(model => toLocalRuntimeModelOption(services.providerService, model))
  })
  on('providers.setDefaultModel', async (params) => {
    const input = parse(z.object({ model: defaultModelSchema.nullable() }).strict(), params)
    return services.providerService.setDefaultModel(input.model)
  })
  on('providers.syncModels', async (params) => {
    const input = parse(z.object({ providerId: idSchema }).strict(), params)
    const models = await services.providerService.syncModels(input.providerId)
    for (const model of models) {
      if (!model.enabled || !model.available)
        blockPinnedAutomations(services, model.providerId, model.id)
    }
    return models.map(model => toLocalRuntimeModelOption(services.providerService, model))
  })
  on('providers.upsertManualModel', async (params) => {
    const input = parse(z.object({
      model: providerModelInputSchema,
      providerId: idSchema,
    }).strict(), params)
    const model = await services.providerService.upsertManualModel(input.providerId, input.model)
    await services.sessions.invalidateAll()
    return toLocalRuntimeModelOption(services.providerService, model)
  })
  on('providers.upsertCustom', async (params) => {
    const provider = await services.providerService.upsertCustomProvider(
      parse(customProviderInputSchema, params),
    )
    await services.sessions.invalidateAll()
    return provider
  })

  on('notifications.list', (params) => {
    parse(emptySchema, params)
    return services.notificationService.list()
  })
  on('notifications.markSeen', (params) => {
    const input = parse(z.object({
      notificationId: idSchema,
      revision: z.string().min(1).max(512),
    }).strict(), params)
    return services.notificationService.markSeen(input.notificationId, input.revision)
  })
  on('notifications.markAllSeen', (params) => {
    parse(emptySchema, params)
    return services.notificationService.markAllSeen()
  })

  on('projects.create', async (params) => {
    const input = parse(z.object({
      instructions: z.string().trim().max(64 * 1024),
      memoryScope: z.enum(['personal_and_project', 'project_only']),
      name: z.string().trim().min(1).max(80),
      root: z.string().min(1),
    }).strict(), params)
    return services.projectService.create(input)
  })
  on('projects.update', async (params) => {
    const input = parse(z.object({
      instructions: z.string().trim().max(64 * 1024),
      memoryScope: z.enum(['personal_and_project', 'project_only']),
      name: z.string().trim().min(1).max(80),
      projectId: idSchema,
      root: z.string().min(1),
    }).strict(), params)
    const current = requireActiveProject(services.projectsRepository.findById(input.projectId))
    const updated = await services.projectService.update(input)
    await services.sessions.invalidateRoot(current.canonicalRoot)
    return updated
  })
  on('projects.delete', async (params) => {
    const input = parse(z.object({ projectId: idSchema }).strict(), params)
    const current = requireActiveProject(services.projectsRepository.findById(input.projectId))
    await services.projectService.delete(input.projectId)
    notifyAutomationsChanged(
      services,
      services.automationService.blockProject(input.projectId),
    )
    await services.sessions.invalidateRoot(current.canonicalRoot)
    return ok()
  })
  on('projects.list', (params) => {
    const input = parse(z.object({ limit: limitSchema }).strict(), params)
    return services.projectService.list().slice(0, input.limit ?? 100)
  })
  on('projects.searchFiles', async (params) => {
    const input = parse(z.object({ projectId: idSchema, query: z.string().max(512) }).strict(), params)
    return services.projectService.searchFiles(input.projectId, input.query)
  })

  on('skills.list', async (params) => {
    const input = parse(z.object({ projectId: idSchema.nullable() }).strict(), params)
    const result = await services.skillService.loadForProject(input.projectId)
    return { diagnostics: result.diagnostics, skills: result.skills }
  })

  on('connectors.list', (params) => {
    parse(emptySchema, params)
    return services.connectorService.list().map(toPublicConnector)
  })
  on('connectors.upsert', async (params) => {
    const input = parse(z.object({
      config: connectorConfigSchema,
      credential: connectorCredentialMutationSchema,
    }).strict(), params)
    await services.connectorService.save({
      config: { ...input.config, credentialRef: null },
      credential: input.credential,
    })
    return services.connectorService.list().map(toPublicConnector)
  })
  on('connectors.remove', async (params) => {
    const input = parse(z.object({ connectorId: idSchema }).strict(), params)
    await services.connectorService.remove(input.connectorId)
    return ok()
  })
  on('connectors.trust', async (params) => {
    const input = parse(z.object({ connectorId: idSchema }).strict(), params)
    await services.connectorService.trust(input.connectorId)
    return ok()
  })
  on('connectors.saveCredential', async (params) => {
    const input = parse(z.object({
      connectorId: idSchema,
      credential: connectorCredentialSchema,
    }).strict(), params)
    await services.connectorService.saveCredential(input.connectorId, input.credential)
    return ok()
  })
  on('connectors.clearCredential', async (params) => {
    const input = parse(z.object({ connectorId: idSchema }).strict(), params)
    await services.connectorService.clearCredential(input.connectorId)
    return ok()
  })

  on('context.usageSnapshot', async (params) => {
    const input = parse(contextUsageSnapshotRequestSchema, params)
    const conversation = input.conversationId
      ? requireValue(services.conversations.findById(input.conversationId), 'VALIDATION_FAILED')
      : null
    if (
      conversation
      && (
        conversation.deletedAt !== null
        || conversation.projectId !== input.projectId
        || conversation.executionProfile !== input.executionProfile
        || !input.branchId
        || !services.conversations.listBranches(conversation.id).some(
          branch => branch.id === input.branchId,
        )
      )
    ) {
      throw new BuddyServiceError('VALIDATION_FAILED')
    }
    const projectId = conversation?.projectId ?? input.projectId
    const executionProfile = conversation?.executionProfile ?? input.executionProfile
    const project = projectId
      ? requireActiveProject(services.projectsRepository.findById(projectId))
      : null
    const canonicalRoot = project?.canonicalRoot
      ?? (conversation
        ? services.paths.conversationWorkspace(conversation.id)
        : services.paths.draftAttachments(input.draftId))
    await mkdir(canonicalRoot, { mode: 0o700, recursive: true })
    await services.providerService.assertModelAvailable(
      input.modelSelection.providerId,
      input.modelSelection.modelId,
    )
    const selectedModel = services.providerService.resolveModelWithParameters(
      input.modelSelection.providerId,
      input.modelSelection.modelId,
      null,
      null,
    )
    const resources = await resolveBuddySessionResources({
      canonicalRoot,
      cwd: canonicalRoot,
      projectInstructions: project?.instructions,
      projectId: project?.id ?? null,
      skills: services.skillService,
    })
    const mcp = await services.connectorService.getTools(new AbortController().signal)
    const systemCapability = new SystemCapabilityService({
      host: services.systemHost,
    })
    const classifications = new Map<string, BuddyToolClassification>(mcp.classifications)
    classifications.set(PET_TOOL_NAME, PET_TOOL_CLASSIFICATION)
    classifications.set(IMAGE_GENERATION_TOOL_NAME, IMAGE_GENERATION_TOOL_CLASSIFICATION)
    const grant = project
      ? {
          canonicalRoot: project.canonicalRoot,
          projectId: project.id,
          root: project.root,
        }
      : {
          canonicalRoot,
          projectId: conversation?.id ?? input.draftId,
          root: canonicalRoot,
        }
    const branchId = input.branchId ?? 'context-preview'
    const conversationId = conversation?.id ?? input.draftId
    const latestRun = conversation
      ? services.runs.findLatestForBranch(conversation.id, branchId)
      : null
    const snapshot = await createBuddyContextSnapshot({
      agentDir: services.agentDirectory,
      branchId,
      canonicalRoot,
      conversationsDirectory: services.paths.conversationsDirectory,
      conversationId,
      cwd: canonicalRoot,
      executionProfile,
      inProcessExtensions: [
        createMcpExtension({ tools: mcp.tools }),
        createImageGenerationExtension({
          artifactService: services.artifactService,
          attachmentService: services.attachmentService,
          conversationId,
          getRunId: () => undefined,
          imageGenerationGateway: services.imageGenerationGateway,
        }),
        createPetExtension({
          getRunId: () => undefined,
          service: services.petService,
        }),
        createSystemExtension({ service: systemCapability }),
        createAutomationExtension({
          onChanged: automationId => notifyAutomationChanged(services, automationId),
          service: services.automationService,
        }),
        createToolPolicyExtension({
          approvalService: services.approvalService,
          classifyTool: async (event, activeRun) => classifyAutomationToolCall(
            services.automationService,
            event,
          ) ?? await classifySystemTool(
            systemCapability,
            event,
            activeRun.signal,
          ) ?? classifications.get(event.toolName) ?? {},
          cwd: canonicalRoot,
          executionProfile,
          getGrants: () => [grant],
          getRunContext: () => null,
        }),
      ],
      model: selectedModel,
      modelRuntime: services.providerService.getSessionRuntime(),
      piSessionFile: latestRun?.piSessionFile ?? undefined,
      recoveryMessages: conversation
        ? () => createContextRecoveryMessages({
            attachmentService: services.attachmentService,
            branchId,
            conversationId: conversation.id,
            conversations: services.conversations,
            fallbackModel: selectedModel,
            providerService: services.providerService,
            runInputs: services.runInputs,
            runs: services.runs,
          })
        : [],
      resources,
      thinkingLevel: normalizeThinkingLevel(input.modelSelection.reasoning),
    })
    return {
      ...snapshot,
      contextWindow: selectedModel.contextWindow,
      createdAt: new Date().toISOString(),
      modelId: selectedModel.id,
      providerId: selectedModel.provider,
    }
  })

  on('workspaceState.read', (params) => {
    const input = parse(z.object({ key: z.literal(WORKSPACE_STATE_KEY) }).strict(), params)
    return services.workspace.getRecord(input.key)
  })
  on('workspaceState.write', (params) => {
    const input = parse(z.object({
      key: z.literal(WORKSPACE_STATE_KEY),
      value: z.unknown(),
    }).strict(), params)
    const updatedAt = new Date().toISOString()
    services.workspace.set(input.key, input.value, updatedAt)
    return requireValue(services.workspace.getRecord(input.key), 'VALIDATION_FAILED')
  })

  on('conversations.list', (params) => {
    const input = parse(z.object({ limit: limitSchema }).strict(), params)
    return services.conversations.listRecent(input.limit ?? 100)
  })
  on('conversations.get', (params) => {
    const input = parse(z.object({ conversationId: idSchema }).strict(), params)
    const conversation = requireValue(
      services.conversations.findById(input.conversationId),
      'VALIDATION_FAILED',
    )
    if (conversation.deletedAt !== null)
      throw new BuddyServiceError('VALIDATION_FAILED')
    return conversation
  })
  on('conversations.rename', (params) => {
    const input = parse(z.object({
      conversationId: idSchema,
      title: z.string().trim().min(1).max(80),
    }).strict(), params)
    return services.conversations.rename({
      id: input.conversationId,
      title: input.title,
      updatedAt: new Date().toISOString(),
    })
  })
  on('conversations.setExecutionProfile', async (params) => {
    const input = parse(z.object({
      conversationId: idSchema,
      executionProfile: executionProfileSchema,
    }).strict(), params)
    const current = requireValue(
      services.conversations.findById(input.conversationId),
      'VALIDATION_FAILED',
    )
    if (current.deletedAt !== null)
      throw new BuddyServiceError('VALIDATION_FAILED')
    if (current.executionProfile === input.executionProfile)
      return current
    const conversation = services.conversations.setExecutionProfile({
      executionProfile: input.executionProfile,
      id: input.conversationId,
      updatedAt: new Date().toISOString(),
    })
    if (!conversation)
      throw new BuddyServiceError('VALIDATION_FAILED')
    await services.sessions.invalidateConversation(input.conversationId)
    return conversation
  })
  on('conversations.setModelSelection', async (params) => {
    const input = parse(z.object({
      conversationId: idSchema,
      modelSelection: modelSelectionSchema,
    }).strict(), params)
    const current = requireValue(
      services.conversations.findById(input.conversationId),
      'VALIDATION_FAILED',
    )
    if (current.deletedAt !== null)
      throw new BuddyServiceError('VALIDATION_FAILED')
    const selection = await resolveModelSelection(services.providerService, input.modelSelection)
    return requireValue(services.conversations.setModelSelection({
      id: input.conversationId,
      modelSelection: {
        modelId: selection.modelId,
        providerId: selection.providerId,
        reasoning: selection.reasoning,
        serviceTier: selection.serviceTier,
      },
      updatedAt: new Date().toISOString(),
    }), 'VALIDATION_FAILED')
  })
  on('conversations.delete', async (params) => {
    const input = parse(z.object({ conversationId: idSchema }).strict(), params)
    const result = await services.automationOccurrenceLifecycle.deleteConversation(
      input.conversationId,
    )
    if (result.automationId)
      notifyAutomationChanged(services, result.automationId)
    return result.deleted
  })
  on('conversations.activateBranch', (params) => {
    const input = parse(z.object({
      branchId: idSchema,
      conversationId: idSchema,
    }).strict(), params)
    return services.conversations.activateBranch({
      ...input,
      updatedAt: new Date().toISOString(),
    })
  })
  on('conversations.listBranches', (params) => {
    const input = parse(z.object({ conversationId: idSchema }).strict(), params)
    requireValue(services.conversations.findById(input.conversationId), 'VALIDATION_FAILED')
    if (services.conversationLifecycle.isDeleting(input.conversationId))
      throw new BuddyServiceError('VALIDATION_FAILED')
    return services.conversations.listBranches(input.conversationId)
  })
  on('conversations.listMessages', (params) => {
    const input = parse(z.object({
      branchId: idSchema.optional(),
      conversationId: idSchema,
      cursor: z.string().regex(/^[\w-]+$/).max(2_048).optional(),
      limit: limitSchema,
    }).strict(), params)
    const conversation = requireValue(
      services.conversations.findById(input.conversationId),
      'VALIDATION_FAILED',
    )
    if (conversation.deletedAt !== null)
      throw new BuddyServiceError('VALIDATION_FAILED')
    const branchId = input.branchId ?? requireValue(conversation.activeBranchId, 'VALIDATION_FAILED')
    const page = services.conversations.listMessagePage(
      input.conversationId,
      branchId,
      {
        beforeMessageId: input.cursor
          ? parseMessagePageCursor(input.cursor, { branchId, conversationId: input.conversationId })
          : null,
        limit: input.limit ?? 100,
      },
    )
    return {
      items: withMessageAttachments(
        page.items,
        services.attachmentService.listForConversation(input.conversationId),
      ),
      nextCursor: page.nextBeforeMessageId
        ? createMessagePageCursor({
            beforeMessageId: page.nextBeforeMessageId,
            branchId,
            conversationId: input.conversationId,
          })
        : null,
    }
  })
  on('conversations.listTimeline', (params) => {
    const input = parse(z.object({
      branchId: idSchema.optional(),
      conversationId: idSchema,
      cursor: z.string().regex(/^[\w-]+$/).max(2_048).optional(),
      limit: limitSchema,
    }).strict(), params)
    const conversation = requireValue(
      services.conversations.findById(input.conversationId),
      'VALIDATION_FAILED',
    )
    if (conversation.deletedAt !== null)
      throw new BuddyServiceError('VALIDATION_FAILED')
    const branchId = input.branchId ?? requireValue(conversation.activeBranchId, 'VALIDATION_FAILED')
    const page = services.conversations.listTimelinePage(
      input.conversationId,
      branchId,
      {
        before: input.cursor
          ? parseConversationTimelineCursor(input.cursor, {
              branchId,
              conversationId: input.conversationId,
            })
          : null,
        limit: input.limit ?? 100,
      },
    )
    const conversationAttachments
      = services.attachmentService.listForConversation(input.conversationId)
    const items = withMessageAttachments(page.items, conversationAttachments)
    const messageItems = items.filter(item => item.kind === 'message')
    const runs = services.runs.listForTimeline(
      input.conversationId,
      branchId,
      messageItems.filter(item => item.role === 'user').map(item => item.id),
      messageItems.flatMap(item => item.runId ? [item.runId] : []),
    )
    const runEvents = services.eventLog.listForRuns(runs.map(run => run.id))
    return {
      items,
      nextCursor: page.nextBefore
        ? createConversationTimelineCursor({
            before: page.nextBefore,
            branchId,
            conversationId: input.conversationId,
          })
        : null,
      outputs: projectRunOutputs(
        runEvents,
        services.artifactsRepository.listForConversation(input.conversationId),
      ),
      runEvents: runEvents.map(toPublicRunEvent),
      runs: runs.map(publicRun),
    }
  })

  on('artifacts.resolvePreview', (params) => {
    const input = parse(z.object({ artifactId: idSchema }).strict(), params)
    return services.artifactService.resolvePreview(input.artifactId)
  })

  on('runs.list', (params) => {
    const input = parse(z.object({
      conversationId: idSchema.nullable().optional(),
      limit: limitSchema,
    }).strict(), params)
    const records = input.conversationId
      ? services.runs.listForConversation(input.conversationId, input.limit ?? 100)
      : services.runs.listRecent(input.limit ?? 100)
    return records.map(publicRun)
  })
  on('runs.get', (params) => {
    const input = parse(z.object({ runId: idSchema }).strict(), params)
    return publicRun(requireValue(services.runs.findById(input.runId), 'VALIDATION_FAILED'))
  })
  on('runs.listEvents', async (params) => {
    const input = parse(z.union([
      z.object({
        afterSequence: z.number().int().nonnegative().optional(),
        limit: eventLimitSchema,
        runId: idSchema,
      }).strict(),
      z.object({
        conversationId: idSchema,
        limit: eventLimitSchema,
      }).strict(),
    ]), params)
    const events = 'conversationId' in input
      ? services.eventLog.listForConversation(input.conversationId, {
          limit: input.limit ?? 500,
        })
      : await services.eventLog.list(input.runId, {
          afterSequence: input.afterSequence,
          limit: input.limit ?? 500,
        })
    return events.map(toPublicRunEvent)
  })

  on('approvals.list', (params) => {
    const input = parse(z.object({
      limit: limitSchema,
      runId: idSchema.nullable().optional(),
      status: z.enum(['pending', 'approved', 'denied', 'cancelled']).nullable().optional(),
    }).strict(), params)
    return services.approvalsRepository.list({
      limit: input.limit,
      runId: input.runId,
      status: input.status as ApprovalStatus | null | undefined,
    }).map(toPublicApproval)
  })
  on('approvals.approve', async (params) => {
    const input = parse(z.object({ approvalId: idSchema }).strict(), params)
    return toPublicApproval(await services.approvalService.resolve({
      decision: 'approved',
      id: input.approvalId,
    }))
  })
  on('approvals.deny', async (params) => {
    const input = parse(z.object({ approvalId: idSchema }).strict(), params)
    return toPublicApproval(await services.approvalService.resolve({
      decision: 'denied',
      id: input.approvalId,
    }))
  })

  on('attachments.registerFiles', async (params) => {
    const input = parse(z.object({
      draftId: sessionIdentitySchema,
      paths: z.array(z.string().min(1)).max(16),
    }).strict(), params)
    return (await services.attachmentService.registerFiles(input.draftId, input.paths))
      .map(toPublicAttachment)
  })
  on('attachments.registerUploads', async (params) => {
    const input = parse(buddyAttachmentImportRequestSchema, params)
    return (await services.attachmentService.registerUploads(input.draftId, input.files))
      .map(toPublicAttachment)
  })
  on('attachments.resolvePreview', (params) => {
    const input = parse(z.object({ attachmentId: idSchema }).strict(), params)
    return services.attachmentService.resolvePreview(input.attachmentId)
  })
  on('attachments.release', async (params) => {
    const input = parse(z.object({ attachmentIds: z.array(idSchema).max(16) }).strict(), params)
    return { releasedAttachmentIds: await services.attachmentService.release(input.attachmentIds) }
  })
  on('attachments.cleanupDrafts', async (params) => {
    parse(emptySchema, params)
    return {
      releasedAttachmentIds: await services.attachmentService.cleanupDrafts(),
    }
  })

  on('usage.snapshot', (params) => {
    parse(emptySchema, params)
    const records = services.usageRepository.listRecent(500)
    return {
      records: records.map(toPublicUsage),
      totals: services.usageRepository.summarize(),
    }
  })

  on('chat.executeCommand', async (params) => {
    const input = parse(chatCommandSchema, params)
    const requestFingerprint = createCommandFingerprint(input)
    const replay = services.commandRequests.findByRequestId(input.requestId)
    const replayRun = replay
      ? requireValue(services.runs.findById(replay.runId), 'VALIDATION_FAILED')
      : null
    if (replay) {
      if (replay.requestFingerprint !== requestFingerprint)
        throw new BuddyServiceError('VALIDATION_FAILED')
      if (!replayRun)
        throw new BuddyServiceError('VALIDATION_FAILED')
      if (replayRun.status !== 'failed' || replayRun.errorCode !== 'RUNTIME_RESTARTED')
        return turnStart(replay, replayRun)
    }

    const conversation = requireValue(
      services.conversations.findById(input.conversationId),
      'VALIDATION_FAILED',
    )
    if (
      conversation.activeBranchId !== input.branchId
      || services.conversationLifecycle.isDeleting(conversation.id)
    ) {
      throw new BuddyServiceError('VALIDATION_FAILED')
    }
    const project = conversation.projectId
      ? requireActiveProject(services.projectsRepository.findById(conversation.projectId))
      : null
    const canonicalRoot = project?.canonicalRoot
      ?? services.paths.conversationWorkspace(conversation.id)
    await mkdir(canonicalRoot, { mode: 0o700, recursive: true })
    const resources = await resolveBuddySessionResources({
      canonicalRoot,
      cwd: canonicalRoot,
      projectInstructions: project?.instructions,
      projectId: project?.id ?? null,
      skills: services.skillService,
    })
    const runId = randomUUID()
    const prepared = replay
      ? services.commandRequests.retryInterrupted({
          createdAt: new Date().toISOString(),
          requestId: input.requestId,
          runId,
        })
      : services.commandRequests.prepare({
          ...input,
          createdAt: new Date().toISOString(),
          executionProfile: conversation.executionProfile,
          requestFingerprint,
          runId,
        })
    if (!prepared.created) {
      return turnStart(
        prepared,
        requireValue(services.runs.findById(prepared.runId), 'VALIDATION_FAILED'),
      )
    }
    const commandRun = requireValue(services.runs.findById(prepared.runId), 'VALIDATION_FAILED')
    const operation = services.runner.startCompaction({
      branchId: prepared.branchId,
      canonicalRoot,
      conversationId: prepared.conversationId,
      customInstructions: prepared.arguments,
      cwd: canonicalRoot,
      memoryScope: project?.memoryScope ?? null,
      projectId: project?.id ?? null,
      resources,
      runId: commandRun.id,
    })
    void operation.completion
    return turnStart(
      prepared,
      requireValue(services.runs.findById(operation.runId), 'VALIDATION_FAILED'),
    )
  })

  on('chat.startTurn', async (params) => {
    const input = parse(startTurnSchema, params)
    const promptCommand = validateTurnCommand(input.content, input.contextItems)
    const requestFingerprint = createRequestFingerprint(input)
    const replay = services.turnRequests.findByRequestId(input.requestId)
    const replayRun = replay
      ? requireValue(services.runs.findById(replay.runId), 'VALIDATION_FAILED')
      : null
    if (replay) {
      if (replay.requestFingerprint !== requestFingerprint)
        throw new BuddyServiceError('VALIDATION_FAILED')
      if (!replayRun)
        throw new BuddyServiceError('VALIDATION_FAILED')
      if (replayRun.status !== 'failed' || replayRun.errorCode !== 'RUNTIME_RESTARTED')
        return turnStart(replay, replayRun)
    }
    if (
      input.conversationId
      && services.conversationLifecycle.isDeleting(input.conversationId)
    ) {
      throw new BuddyServiceError('VALIDATION_FAILED')
    }
    const project = input.projectId
      ? requireActiveProject(services.projectsRepository.findById(input.projectId))
      : null
    const conversationId = replay?.conversationId ?? input.conversationId ?? randomUUID()
    const canonicalRoot = project?.canonicalRoot
      ?? services.paths.conversationWorkspace(conversationId)
    await mkdir(canonicalRoot, { mode: 0o700, recursive: true })
    const existingConversation = services.conversations.findById(conversationId)
    if (
      existingConversation
      && (
        existingConversation.projectId !== (project?.id ?? null)
        || existingConversation.executionProfile !== input.executionProfile
      )
    ) {
      throw new BuddyServiceError('VALIDATION_FAILED')
    }
    const branchId = replay?.branchId
      ?? input.branchId
      ?? existingConversation?.activeBranchId
      ?? randomUUID()
    if (existingConversation && existingConversation.activeBranchId !== branchId)
      throw new BuddyServiceError('VALIDATION_FAILED')
    if (services.conversationLifecycle.isDeleting(conversationId))
      throw new BuddyServiceError('VALIDATION_FAILED')
    const replayInput = replayRun ? services.runInputs.findByRunId(replayRun.id) : null
    if (replayRun && !replayInput)
      throw new BuddyServiceError('VALIDATION_FAILED')
    const attachmentPrompt = await services.attachmentService.materializePrompt(
      replayInput?.attachmentIds ?? input.attachmentIds,
      replayInput || promptCommand ? '' : input.content,
      conversationId,
      replayInput ? null : input.draftId,
    )
    const context = replayInput
      ? ''
      : [
          await materializeContextItems(
            input.contextItems,
            project,
            services.skillService,
          ),
          promptCommand ? materializeBuddyPromptCommand(promptCommand) : '',
        ].filter(Boolean).join('\n\n---\n\n')
    const prompt = replayInput?.prompt
      ?? [attachmentPrompt.prompt, context].filter(Boolean).join('\n\n---\n\n')
    if (Buffer.byteLength(prompt) > MAX_MODEL_INPUT_BYTES)
      throw new BuddyServiceError('VALIDATION_FAILED')
    const selection = replayRun
      ? {
          contextWindow: replayRun.contextWindow,
          maxTokens: replayRun.maxTokens,
          modelId: replayRun.model,
          providerId: replayRun.provider,
          reasoning: replayInput?.reasoning ?? null,
          serviceTier: replayInput?.serviceTier ?? null,
        }
      : await resolveModelSelection(services.providerService, input.modelSelection)
    const resources = await resolveBuddySessionResources({
      canonicalRoot,
      cwd: canonicalRoot,
      projectInstructions: project?.instructions,
      projectId: project?.id ?? null,
      skills: services.skillService,
    })
    const thinkingLevel = normalizeThinkingLevel(
      replayInput ? replayInput.reasoning : selection.reasoning,
    )
    const runId = randomUUID()
    const userMessageId = randomUUID()
    const stagedAttachments = replay
      ? null
      : await services.attachmentService.prepareMessageAttachments({
          attachmentIds: input.attachmentIds,
          conversationId,
          draftId: input.draftId,
          messageId: userMessageId,
        })
    const persistedAttachmentIds = replayInput?.attachmentIds
      ?? stagedAttachments?.bindings.map(binding => binding.id)
      ?? []
    let prepared
    try {
      prepared = replay
        ? services.turnRequests.retryInterrupted({
            createdAt: new Date().toISOString(),
            requestId: input.requestId,
            runId,
          })
        : services.turnRequests.prepare({
            attachmentBindings: stagedAttachments?.bindings ?? [],
            branchId,
            conversationId,
            createdAt: new Date().toISOString(),
            executionProfile: input.executionProfile,
            model: selection.modelId,
            modelParameters: selection.contextWindow !== null && selection.maxTokens !== null
              ? { contextWindow: selection.contextWindow, maxTokens: selection.maxTokens }
              : undefined,
            projectId: project?.id ?? null,
            provider: selection.providerId,
            requestFingerprint,
            requestId: input.requestId,
            runInput: {
              attachmentIds: persistedAttachmentIds,
              contextItems: input.contextItems,
              prompt,
              reasoning: thinkingLevel ?? null,
              serviceTier: replayInput ? replayInput.serviceTier : selection.serviceTier,
            },
            runId,
            title: createConversationTitle(input.content, attachmentPrompt.records),
            userMessageContent: {
              attachmentIds: persistedAttachmentIds,
              contextItems: input.contextItems,
              text: input.content,
            },
            userMessageId,
          })
    }
    catch (error) {
      await stagedAttachments?.rollback()
      throw error
    }
    await stagedAttachments?.commit().catch(() => undefined)
    if (!prepared.created) {
      return turnStart(
        prepared,
        requireValue(services.runs.findById(prepared.runId), 'VALIDATION_FAILED'),
      )
    }
    const preparedRun = requireValue(services.runs.findById(prepared.runId), 'VALIDATION_FAILED')
    const turn = services.turnLauncher.startTurn({
      branchId: prepared.branchId,
      canonicalRoot,
      conversationId: prepared.conversationId,
      cwd: canonicalRoot,
      images: attachmentPrompt.images,
      memoryScope: project?.memoryScope ?? null,
      model: preparedRun.model,
      projectId: project?.id ?? null,
      prompt,
      provider: preparedRun.provider,
      resources,
      runId: prepared.runId,
      sessionMode: 'interactive',
      serviceTier: replayInput ? replayInput.serviceTier : selection.serviceTier,
      thinkingLevel,
    })
    void turn.completion
    return turnStart(
      prepared,
      requireValue(services.runs.findById(turn.runId), 'VALIDATION_FAILED'),
    )
  })
  on('chat.editUserMessage', async (params) => {
    const input = parse(editUserMessageSchema, params)
    const requestFingerprint = createEditUserMessageFingerprint(input)
    const replay = services.turnRequests.findByRequestId(input.requestId)
    const replayRun = replay
      ? requireValue(services.runs.findById(replay.runId), 'VALIDATION_FAILED')
      : null
    if (replay) {
      if (
        replay.requestFingerprint !== requestFingerprint
        || replay.conversationId !== input.conversationId
      ) {
        throw new BuddyServiceError('VALIDATION_FAILED')
      }
      if (replayRun?.status !== 'failed' || replayRun.errorCode !== 'RUNTIME_RESTARTED')
        return turnStart(replay, requireValue(replayRun, 'VALIDATION_FAILED'))
    }

    const conversation = requireValue(
      services.conversations.findById(input.conversationId),
      'VALIDATION_FAILED',
    )
    if (services.conversationLifecycle.isDeleting(conversation.id))
      throw new BuddyServiceError('VALIDATION_FAILED')
    const parentBranchId = requireValue(conversation.activeBranchId, 'VALIDATION_FAILED')
    const history = services.conversations.listBranchMessages(conversation.id, parentBranchId)
    const sourceIndex = history.findIndex(message => message.id === input.userMessageId)
    const sourceMessage = sourceIndex >= 0 ? history[sourceIndex] : null
    if (sourceMessage?.role !== 'user')
      throw new BuddyServiceError('VALIDATION_FAILED')
    const forkedFromMessageId = sourceIndex > 0 ? history[sourceIndex - 1]?.id ?? null : null
    const project = conversation.projectId
      ? requireActiveProject(services.projectsRepository.findById(conversation.projectId))
      : null
    const canonicalRoot = project?.canonicalRoot
      ?? services.paths.conversationWorkspace(conversation.id)
    await mkdir(canonicalRoot, { mode: 0o700, recursive: true })
    const replayInput = replayRun ? services.runInputs.findByRunId(replayRun.id) : null
    if (replayRun && !replayInput)
      throw new BuddyServiceError('VALIDATION_FAILED')
    const attachmentIds = replayInput?.attachmentIds ?? input.attachmentIds
    const attachmentPrompt = await services.attachmentService.materializePrompt(
      attachmentIds,
      replayInput ? '' : input.content,
      conversation.id,
      replayInput ? null : input.draftId,
    )
    const context = replayInput
      ? ''
      : await materializeContextItems(input.contextItems, project, services.skillService)
    const prompt = replayInput?.prompt
      ?? [attachmentPrompt.prompt, context].filter(Boolean).join('\n\n---\n\n')
    if (Buffer.byteLength(prompt) > MAX_MODEL_INPUT_BYTES)
      throw new BuddyServiceError('VALIDATION_FAILED')
    const selection = replayRun
      ? {
          contextWindow: replayRun.contextWindow,
          maxTokens: replayRun.maxTokens,
          modelId: replayRun.model,
          providerId: replayRun.provider,
          reasoning: replayInput?.reasoning ?? null,
          serviceTier: replayInput?.serviceTier ?? null,
        }
      : await resolveModelSelection(services.providerService, input.modelSelection)
    const resources = await resolveBuddySessionResources({
      canonicalRoot,
      cwd: canonicalRoot,
      projectInstructions: project?.instructions,
      projectId: project?.id ?? null,
      skills: services.skillService,
    })
    const thinkingLevel = normalizeThinkingLevel(
      replayInput ? replayInput.reasoning : selection.reasoning,
    )
    const runId = randomUUID()
    const userMessageId = randomUUID()
    const stagedAttachments = replay
      ? null
      : await services.attachmentService.prepareMessageAttachments({
          attachmentIds: input.attachmentIds,
          conversationId: conversation.id,
          draftId: input.draftId,
          messageId: userMessageId,
        })
    const persistedAttachmentIds = replayInput?.attachmentIds
      ?? stagedAttachments?.bindings.map(binding => binding.id)
      ?? []
    let prepared
    try {
      prepared = replay
        ? services.turnRequests.retryInterrupted({
            createdAt: new Date().toISOString(),
            requestId: input.requestId,
            runId,
          })
        : services.turnRequests.edit({
            attachmentBindings: stagedAttachments?.bindings ?? [],
            branchId: randomUUID(),
            conversationId: conversation.id,
            createdAt: new Date().toISOString(),
            executionProfile: conversation.executionProfile,
            forkedFromMessageId,
            model: selection.modelId,
            modelParameters: selection.contextWindow !== null && selection.maxTokens !== null
              ? { contextWindow: selection.contextWindow, maxTokens: selection.maxTokens }
              : undefined,
            parentBranchId,
            projectId: project?.id ?? null,
            provider: selection.providerId,
            requestFingerprint,
            requestId: input.requestId,
            runId,
            runInput: {
              attachmentIds: persistedAttachmentIds,
              contextItems: input.contextItems,
              prompt,
              reasoning: thinkingLevel ?? null,
              serviceTier: replayInput ? replayInput.serviceTier : selection.serviceTier,
            },
            sourceUserMessageId: input.userMessageId,
            title: null,
            userMessageContent: {
              attachmentIds: persistedAttachmentIds,
              contextItems: input.contextItems,
              text: input.content,
            },
            userMessageId,
          })
    }
    catch (error) {
      await stagedAttachments?.rollback()
      throw error
    }
    await stagedAttachments?.commit().catch(() => undefined)
    if (!prepared.created) {
      return turnStart(
        prepared,
        requireValue(services.runs.findById(prepared.runId), 'VALIDATION_FAILED'),
      )
    }
    const preparedRun = requireValue(
      services.runs.findById(prepared.runId),
      'VALIDATION_FAILED',
    )
    const turn = services.turnLauncher.startTurn({
      branchId: prepared.branchId,
      canonicalRoot,
      conversationId: prepared.conversationId,
      cwd: canonicalRoot,
      images: attachmentPrompt.images,
      memoryScope: project?.memoryScope ?? null,
      model: preparedRun.model,
      projectId: project?.id ?? null,
      prompt,
      provider: preparedRun.provider,
      resources,
      runId: prepared.runId,
      sessionMode: 'interactive',
      serviceTier: replayInput ? replayInput.serviceTier : selection.serviceTier,
      thinkingLevel,
    })
    void turn.completion
    return turnStart(
      prepared,
      requireValue(services.runs.findById(turn.runId), 'VALIDATION_FAILED'),
    )
  })
  on('chat.regenerateAssistant', async (params) => {
    const input = parse(regenerateAssistantSchema, params)
    const requestFingerprint = createRegenerationFingerprint(input)
    const replay = services.turnRequests.findByRequestId(input.requestId)
    const replayRun = replay
      ? requireValue(services.runs.findById(replay.runId), 'VALIDATION_FAILED')
      : null
    if (replay) {
      if (
        replay.requestFingerprint !== requestFingerprint
        || replay.conversationId !== input.conversationId
      ) {
        throw new BuddyServiceError('VALIDATION_FAILED')
      }
      if (replayRun?.status !== 'failed' || replayRun.errorCode !== 'RUNTIME_RESTARTED')
        return turnStart(replay, requireValue(replayRun, 'VALIDATION_FAILED'))
    }

    const conversation = requireValue(
      services.conversations.findById(input.conversationId),
      'VALIDATION_FAILED',
    )
    if (services.conversationLifecycle.isDeleting(conversation.id))
      throw new BuddyServiceError('VALIDATION_FAILED')
    const parentBranchId = requireValue(conversation.activeBranchId, 'VALIDATION_FAILED')
    const project = conversation.projectId
      ? requireActiveProject(services.projectsRepository.findById(conversation.projectId))
      : null
    const canonicalRoot = project?.canonicalRoot
      ?? services.paths.conversationWorkspace(conversation.id)
    await mkdir(canonicalRoot, { mode: 0o700, recursive: true })
    let sourceRun: RunRecord | null = null
    if (!replay) {
      const history = services.conversations.listBranchMessages(conversation.id, parentBranchId)
      const assistantIndex = history.findIndex(message => message.id === input.assistantMessageId)
      const assistantMessage = assistantIndex >= 0 ? history[assistantIndex] : null
      sourceRun = assistantMessage?.role === 'assistant' && assistantMessage.runId
        ? services.runs.findById(assistantMessage.runId)
        : null
      const triggerIndex = history.findIndex(
        message => message.id === sourceRun?.triggeringMessageId,
      )
      if (
        !sourceRun
        || sourceRun.conversationId !== conversation.id
        || triggerIndex < 0
        || triggerIndex >= assistantIndex
      ) {
        throw new BuddyServiceError('VALIDATION_FAILED')
      }
    }

    const storedInput = services.runInputs.findByRunId(
      requireValue(replayRun ?? sourceRun, 'VALIDATION_FAILED').id,
    )
    if (!storedInput || Buffer.byteLength(storedInput.prompt) > MAX_MODEL_INPUT_BYTES)
      throw new BuddyServiceError('VALIDATION_FAILED')
    const attachmentPrompt = await services.attachmentService.materializePrompt(
      storedInput.attachmentIds,
      '',
      conversation.id,
    )
    const resources = await resolveBuddySessionResources({
      canonicalRoot,
      cwd: canonicalRoot,
      projectInstructions: project?.instructions,
      projectId: project?.id ?? null,
      skills: services.skillService,
    })
    const runId = randomUUID()
    const prepared = replay
      ? services.turnRequests.retryInterrupted({
          createdAt: new Date().toISOString(),
          requestId: input.requestId,
          runId,
        })
      : services.turnRequests.regenerate({
          branchId: randomUUID(),
          conversationId: conversation.id,
          createdAt: new Date().toISOString(),
          executionProfile: conversation.executionProfile,
          forkedFromMessageId: requireValue(sourceRun, 'VALIDATION_FAILED').triggeringMessageId,
          parentBranchId,
          requestFingerprint,
          requestId: input.requestId,
          runId,
          sourceRunId: requireValue(sourceRun, 'VALIDATION_FAILED').id,
        })
    if (!prepared.created) {
      return turnStart(
        prepared,
        requireValue(services.runs.findById(prepared.runId), 'VALIDATION_FAILED'),
      )
    }
    const preparedRun = requireValue(
      services.runs.findById(prepared.runId),
      'VALIDATION_FAILED',
    )
    const preparedInput = requireValue(
      services.runInputs.findByRunId(prepared.runId),
      'VALIDATION_FAILED',
    )
    const turn = services.turnLauncher.startTurn({
      branchId: prepared.branchId,
      canonicalRoot,
      conversationId: prepared.conversationId,
      cwd: canonicalRoot,
      images: attachmentPrompt.images,
      memoryScope: project?.memoryScope ?? null,
      model: preparedRun.model,
      projectId: project?.id ?? null,
      prompt: preparedInput.prompt,
      provider: preparedRun.provider,
      resources,
      runId: prepared.runId,
      sessionMode: 'interactive',
      serviceTier: preparedInput.serviceTier,
      thinkingLevel: normalizeThinkingLevel(preparedInput.reasoning),
    })
    void turn.completion
    return turnStart(
      prepared,
      requireValue(services.runs.findById(turn.runId), 'VALIDATION_FAILED'),
    )
  })
  on('chat.cancel', async (params) => {
    const input = parse(z.object({ runId: idSchema }).strict(), params)
    await services.runner.cancel(input.runId)
    return publicRun(requireValue(services.runs.findById(input.runId), 'VALIDATION_FAILED'))
  })

  return () => disposers.splice(0).forEach(dispose => dispose())
}

interface ContextRecoveryMessageOptions {
  attachmentService: AttachmentService
  branchId: string
  conversationId: string
  conversations: RuntimeServices['conversations']
  fallbackModel: ReturnType<RuntimeServices['providerService']['resolveModelWithParameters']>
  providerService: RuntimeServices['providerService']
  runInputs: RuntimeServices['runInputs']
  runs: RuntimeServices['runs']
}

async function createContextRecoveryMessages(options: ContextRecoveryMessageOptions) {
  const history = options.conversations.listBranchMessages(
    options.conversationId,
    options.branchId,
  )
  const recoveredUserInputs = new Map<string, {
    images: Awaited<ReturnType<AttachmentService['materializeRecoveryImages']>>['images']
    prompt: string
  }>()
  for (const message of history) {
    if (message.role !== 'user')
      continue
    const storedInput = options.runInputs.findByTriggeringMessageId(message.id)
    if (!storedInput)
      continue
    const recovery = await options.attachmentService.materializeRecoveryImages(
      storedInput.attachmentIds,
      options.conversationId,
    )
    recoveredUserInputs.set(message.id, {
      images: recovery.images,
      prompt: storedInput.prompt,
    })
  }
  return createBuddyRecoveryMessages({
    fallbackModel: options.fallbackModel,
    messages: history,
    resolveRunModel: (runId) => {
      const historicalRun = options.runs.findById(runId)
      if (!historicalRun)
        return null
      try {
        return options.providerService.resolveModelWithParameters(
          historicalRun.provider,
          historicalRun.model,
          historicalRun.contextWindow,
          historicalRun.maxTokens,
        )
      }
      catch {
        return null
      }
    },
    resolveUserInput: messageId => recoveredUserInputs.get(messageId) ?? null,
    triggeringMessageId: null,
  })
}

function createRequestFingerprint(input: z.infer<typeof startTurnSchema>): string {
  const payload = { ...input, requestId: undefined }
  return createHash('sha256').update(stableSerialize(payload)).digest('hex')
}

function createRegenerationFingerprint(
  input: z.infer<typeof regenerateAssistantSchema>,
): string {
  return createHash('sha256').update(stableSerialize({
    assistantMessageId: input.assistantMessageId,
    conversationId: input.conversationId,
    operation: 'regenerate-assistant',
  })).digest('hex')
}

function createEditUserMessageFingerprint(
  input: z.infer<typeof editUserMessageSchema>,
): string {
  return createHash('sha256').update(stableSerialize({
    ...input,
    operation: 'edit-user-message',
    requestId: undefined,
  })).digest('hex')
}

function createCommandFingerprint(input: z.infer<typeof chatCommandSchema>): string {
  return createHash('sha256').update(stableSerialize({
    arguments: input.arguments.trim(),
    branchId: input.branchId,
    command: input.command,
    conversationId: input.conversationId,
  })).digest('hex')
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

async function resolveModelSelection(
  providers: Awaited<ReturnType<typeof createProviderService>>,
  requested: z.infer<typeof startTurnSchema>['modelSelection'],
): Promise<{
  contextWindow: number
  maxTokens: number
  modelId: string
  providerId: string
  reasoning: BuddyThinkingLevel | null
  serviceTier: BuddyServiceTier | null
}> {
  const available = await providers.listProviders()
  if (requested) {
    const model = await assertRequestedModelAvailable(providers, available, requested)
    if (
      requested.serviceTier !== null
      && !resolveBuddyServiceTiers({
        api: model.api,
        modelId: model.id,
        providerId: requested.providerId,
      }).some(option => option.id === requested.serviceTier)
    ) {
      throw new BuddyServiceError('VALIDATION_FAILED')
    }
    return { ...requested, contextWindow: model.contextWindow, maxTokens: model.maxTokens }
  }
  const fallback = await providers.getDefaultModel()
  if (fallback) {
    const model = await assertRequestedModelAvailable(providers, available, fallback)
    return {
      ...fallback,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      serviceTier: null,
    }
  }
  throw new BuddyServiceError('AUTHENTICATION_REQUIRED')
}

async function resolveAutomationModel(
  providers: Awaited<ReturnType<typeof createProviderService>>,
  target: AutomationModelTarget,
): Promise<ResolvedAutomationModel | null> {
  const selected = target.mode === 'pinned'
    ? {
        modelId: target.modelId,
        providerId: target.providerId,
        reasoning: target.reasoning,
      }
    : await providers.getDefaultModel()
  if (!selected)
    return null
  try {
    const model = await assertRequestedModelAvailable(
      providers,
      await providers.listProviders(),
      selected,
    )
    if (
      selected.reasoning !== null
      && !getSupportedThinkingLevels(model).includes(selected.reasoning)
    ) {
      return null
    }
    return {
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      modelId: selected.modelId,
      providerId: selected.providerId,
      reasoning: selected.reasoning,
    }
  }
  catch {
    return null
  }
}

function toResolvedAutomationProject(project: ProjectRecord) {
  return {
    canonicalRoot: project.canonicalRoot,
    id: project.id,
    instructions: project.instructions,
    memoryScope: project.memoryScope,
  }
}

async function assertRequestedModelAvailable(
  providers: Awaited<ReturnType<typeof createProviderService>>,
  available: Awaited<ReturnType<typeof providers.listProviders>>,
  requested: { modelId: string, providerId: string },
): ReturnType<typeof providers.assertModelAvailable> {
  const provider = available.find(candidate => candidate.id === requested.providerId)
  if (!provider?.added || !provider.enabled || provider.status === 'unavailable')
    throw new BuddyServiceError('PROVIDER_UNAVAILABLE')
  if (provider.status !== 'available')
    throw new BuddyServiceError('AUTHENTICATION_REQUIRED')
  return providers.assertModelAvailable(requested.providerId, requested.modelId)
}

function toLocalRuntimeModelOption(
  providers: Awaited<ReturnType<typeof createProviderService>>,
  model: Awaited<ReturnType<typeof providers.listModels>>[number],
) {
  let reasoningOptions: string[] = []
  if (model.capabilities.includes('reasoning')) {
    try {
      reasoningOptions = [...getSupportedThinkingLevels(
        providers.resolveModel(model.providerId, model.id),
      )]
    }
    catch {}
  }
  return {
    available: model.available,
    capabilities: model.capabilities,
    contextWindow: model.contextWindow,
    displayName: model.displayName,
    enabled: model.enabled,
    hasParameterOverride: model.hasParameterOverride,
    lastSeenAt: model.lastSeenAt,
    maxTokens: model.maxTokens,
    modelId: model.id,
    overrideContextWindow: model.overrideContextWindow,
    overrideMaxTokens: model.overrideMaxTokens,
    providerId: model.providerId,
    reasoningOptions,
    serviceTiers: resolveBuddyServiceTiers({
      api: model.api,
      modelId: model.id,
      providerId: model.providerId,
    }),
    source: model.source,
    sourceContextWindow: model.sourceContextWindow,
    sourceMaxTokens: model.sourceMaxTokens,
    sourceParametersUpdated: model.sourceParametersUpdated,
  }
}

async function materializeContextItems(
  items: z.infer<typeof startTurnSchema>['contextItems'],
  project: ProjectRecord | null,
  skillService: SkillService,
): Promise<string> {
  let selectedSkills: Awaited<ReturnType<SkillService['materializeForProject']>>
  try {
    selectedSkills = await skillService.materializeForProject(
      project?.id ?? null,
      items.filter(item => item.kind === 'skill').map(item => item.value),
    )
  }
  catch (error) {
    if (error instanceof BuddySkillSelectionError)
      throw new BuddyServiceError('VALIDATION_FAILED')
    throw error
  }
  const skillsByName = new Map(selectedSkills.map(skill => [skill.name, skill]))
  const sections: string[] = []
  for (const item of items) {
    if (item.kind === 'skill') {
      const skill = skillsByName.get(item.value)
      if (!skill)
        throw new BuddyServiceError('VALIDATION_FAILED')
      sections.push(formatBuddySkillPrompt(skill))
      continue
    }
    if (item.kind === 'slashCommand') {
      continue
    }
    if (!project)
      throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
    const resolution = await resolveGrantedPath([{
      canonicalRoot: project.canonicalRoot,
      projectId: project.id,
      root: project.root,
    }], join(project.canonicalRoot, item.value), 'existing')
    const content = await readBoundedFile(project.canonicalRoot, resolution.canonicalPath)
    if (content.byteLength > MAX_CONTEXT_FILE_BYTES)
      throw new BuddyServiceError('VALIDATION_FAILED')
    sections.push(`上下文文件：${item.value}\n\n${content.toString('utf8')}`)
  }
  return sections.join('\n\n---\n\n')
}

function validateTurnCommand(
  content: string,
  items: z.infer<typeof startTurnSchema>['contextItems'],
) {
  const command = parseBuddyChatCommand(content)
  const commandItems = items.filter(item => item.kind === 'slashCommand')
  if (command?.kind === 'action')
    throw new BuddyServiceError('VALIDATION_FAILED')
  if (commandItems.length === 0)
    return command?.kind === 'prompt' ? command : null
  if (
    commandItems.length !== 1
    || !command
    || command.kind !== 'prompt'
    || commandItems[0]!.value !== `/${command.name}`
  ) {
    throw new BuddyServiceError('VALIDATION_FAILED')
  }
  return command
}

function normalizeThinkingLevel(
  value: string | null | undefined,
): CreateBuddySessionOptions['thinkingLevel'] {
  if (!value)
    return undefined
  if (!isBuddyThinkingLevel(value))
    throw new BuddyServiceError('VALIDATION_FAILED')
  return value
}

function toPublicRun(run: RunRecord, reasoningLevel: string | null) {
  return {
    branchId: run.branchId,
    completedAt: run.completedAt,
    conversationId: run.conversationId,
    errorCode: run.errorCode,
    executionProfile: run.executionProfile,
    id: run.id,
    modelId: run.model,
    providerId: run.provider,
    purpose: run.purpose,
    reasoningLevel,
    startedAt: run.startedAt,
    status: run.status,
    triggeringMessageId: run.triggeringMessageId,
  }
}

function notifyAutomationChanged(services: RuntimeServices, automationId: string): void {
  services.rpc.notify('automation.changed', { automationId })
  void services.automationScheduler.wake()
}

function notifyAutomationsChanged(
  services: RuntimeServices,
  automations: readonly Automation[],
): void {
  if (automations.length === 0)
    return
  for (const automation of automations)
    services.rpc.notify('automation.changed', { automationId: automation.id })
  void services.automationScheduler.wake()
}

function blockPinnedAutomations(
  services: RuntimeServices,
  providerId: string,
  modelId?: string,
): void {
  notifyAutomationsChanged(
    services,
    services.automationService.blockPinnedModel(providerId, modelId),
  )
}

function reconcileAutomationDependencies(input: {
  automationService: AutomationService
  projectsRepository: ReturnType<typeof createProjectRepository>
  providersRepository: ReturnType<typeof createProviderRepository>
}): Automation[] {
  const active: Automation[] = []
  let cursor: string | null = null
  do {
    const page = input.automationService.list({
      cursor,
      limit: 100,
      statuses: ['active'],
    })
    active.push(...page.items)
    cursor = page.nextCursor
  } while (cursor)

  const blocked = new Map<string, Automation>()
  for (const automation of active) {
    if (automation.projectId) {
      const project = input.projectsRepository.findById(automation.projectId)
      if (!project || project.revokedAt) {
        for (const item of input.automationService.blockProject(automation.projectId))
          blocked.set(item.id, item)
        continue
      }
    }
    if (automation.model.mode !== 'pinned')
      continue
    const provider = input.providersRepository.findState(automation.model.providerId)
    const model = input.providersRepository.findModelState(
      automation.model.providerId,
      automation.model.modelId,
    )
    if (!provider?.enabled || !model?.enabled || !model.available) {
      for (const item of input.automationService.blockPinnedModel(
        automation.model.providerId,
        automation.model.modelId,
      )) {
        blocked.set(item.id, item)
      }
    }
  }
  return [...blocked.values()]
}

function toAutomationOccurrenceView(
  services: RuntimeServices,
  occurrence: AutomationOccurrenceRecord,
) {
  const run = occurrence.runId ? services.runs.findById(occurrence.runId) : null
  const pendingApprovalCount = run
    ? services.approvalsRepository.listPending(run.id).length
    : 0
  const effectiveStatus = run
    ? pendingApprovalCount > 0 && ['queued', 'running'].includes(run.status)
      ? 'awaiting_approval' as const
      : run.status
    : occurrence.status === 'bound' ? 'queued' : occurrence.status
  return {
    automationId: occurrence.automationId,
    automationName: occurrence.executionSnapshot.name,
    automationRevision: occurrence.automationRevision,
    boundAt: occurrence.boundAt,
    coalescedMissedCount: occurrence.coalescedMissedCount,
    conversationId: occurrence.conversationId,
    effectiveStatus,
    errorCode: occurrence.errorCode,
    errorSummary: occurrence.errorSummary,
    finishedAt: occurrence.finishedAt,
    id: occurrence.id,
    pendingApprovalCount,
    queuedAt: occurrence.queuedAt,
    run: run
      ? {
          completedAt: run.completedAt,
          errorCode: run.errorCode,
          startedAt: run.startedAt,
          status: run.status,
        }
      : null,
    runId: occurrence.runId,
    scheduledFor: occurrence.scheduledFor,
    status: occurrence.status,
    triggerKind: occurrence.triggerKind,
  }
}

function toPublicApproval(approval: ApprovalRecord) {
  const kind = new Set(['automation', 'delete', 'mcp', 'network', 'shell', 'system'])
    .has(approval.kind)
    ? approval.kind
    : 'system'
  return { ...approval, kind }
}

function toPublicConnector(record: McpServerRecord) {
  const common = {
    credentialConfigured: record.credentialRef !== null,
    enabled: record.enabled,
    id: record.id,
    name: record.name,
    trusted: record.trustedAt !== null,
  }
  if (record.transport === 'stdio') {
    return {
      ...common,
      args: record.args ?? [],
      command: record.command ?? '',
      cwd: record.cwd,
      transport: record.transport,
    }
  }
  return { ...common, transport: record.transport, url: record.url ?? '' }
}

function toPublicAttachment(record: AttachmentRecord) {
  return {
    attachmentId: record.id,
    kind: record.mimeType.startsWith('image/')
      ? 'image'
      : isTextMimeType(record.mimeType) ? 'text' : 'binary',
    mimeType: record.mimeType,
    name: record.name,
    previewUrl: null,
    sizeBytes: record.sizeBytes,
  }
}

function toPublicArtifact(record: ArtifactRecord) {
  return {
    artifactId: record.id,
    conversationId: record.conversationId,
    createdAt: record.createdAt,
    mimeType: record.mimeType,
    name: record.name,
    previewUrl: null,
    runId: record.runId,
    sizeBytes: record.sizeBytes,
    sourceArtifactId: record.sourceArtifactId,
    sourceToolCallId: record.sourceToolCallId,
  }
}

function projectRunOutputs(
  events: readonly BuddyRunEvent[],
  artifacts: readonly ArtifactRecord[],
) {
  const artifactsById = new Map(artifacts.map(record => [record.id, record]))
  const projectedArtifactIds = new Set<string>()
  return events.flatMap((event) => {
    if (event.type !== 'output.produced')
      return []
    const output = buddyRunOutputPayloadSchema.safeParse(event.payload)
    if (!output.success)
      return []
    const projectedArtifacts = output.data.artifactIds.flatMap((artifactId) => {
      if (projectedArtifactIds.has(artifactId))
        return []
      const artifact = artifactsById.get(artifactId)
      if (!artifact)
        return []
      projectedArtifactIds.add(artifactId)
      return [toPublicArtifact(artifact)]
    })
    return projectedArtifacts.length > 0
      ? [{
          artifacts: projectedArtifacts,
          createdAt: event.createdAt,
          runId: event.runId,
          sourceToolCallId: output.data.sourceToolCallId,
        }]
      : []
  })
}

function withMessageAttachments<
  Item extends { content?: unknown, kind?: string },
>(items: readonly Item[], attachments: readonly AttachmentRecord[]) {
  const attachmentsById = new Map(attachments.map(record => [record.id, record]))
  return items.map((item) => {
    if (item.kind && item.kind !== 'message')
      return item
    return {
      ...item,
      attachments: readMessageAttachmentIds(item.content)
        .flatMap(id => attachmentsById.get(id) ?? [])
        .map(toPublicAttachment),
    }
  })
}

function readMessageAttachmentIds(content: unknown): string[] {
  if (!content || typeof content !== 'object' || Array.isArray(content))
    return []
  const attachmentIds = (content as Record<string, unknown>).attachmentIds
  return Array.isArray(attachmentIds)
    ? attachmentIds.filter((id): id is string => typeof id === 'string')
    : []
}

function toPublicUsage(record: UsageRecord) {
  const { model, provider, sourceEntryId: _sourceEntryId, ...rest } = record
  return { ...rest, modelId: model, providerId: provider }
}

function createConversationTitle(content: string, attachments: readonly AttachmentRecord[]): string {
  return content.trim().replaceAll(/\s+/g, ' ').slice(0, 80)
    || attachments.map(attachment => basename(attachment.name)).join(', ').slice(0, 80)
    || 'New conversation'
}

function requireActiveProject(project: ProjectRecord | null): ProjectRecord {
  if (!project || project.revokedAt !== null)
    throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
  return project
}

function requireValue<T>(value: T | null, code: string): T {
  if (value === null)
    throw new BuddyServiceError(code)
  return value
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success)
    throw new BuddyServiceError('VALIDATION_FAILED')
  return result.data
}

function ok() {
  return { ok: true as const }
}

function isTextMimeType(mimeType: string): boolean {
  return mimeType.startsWith('text/') || new Set([
    'application/json',
    'application/toml',
    'application/xml',
    'application/yaml',
  ]).has(mimeType)
}

export class BuddyServiceError extends Error {
  readonly code: string

  constructor(code: string) {
    super('Lexora Buddy runtime request failed')
    this.name = 'BuddyServiceError'
    this.code = code
  }
}
