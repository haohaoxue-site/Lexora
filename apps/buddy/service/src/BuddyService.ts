import type { DatabaseSync } from 'node:sqlite'
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
import type { BuddyServiceRpcServer } from './rpc/BuddyServiceRpcServer'
import type { ApprovalRecord, ApprovalStatus } from './storage/approvalRepository'
import type { AttachmentRecord } from './storage/attachmentRepository'
import type { McpServerRecord } from './storage/connectorRepository'
import type { ProjectRecord } from './storage/projectRepository'
import type { RunRecord } from './storage/runRepository'
import type { UsageRecord } from './storage/usageRepository'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'

import { mkdir } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { getSupportedThinkingLevels } from '@earendil-works/pi-ai'
import { z } from 'zod'
import {
  materializeBuddyPromptCommand,
  parseBuddyChatCommand,
} from '../../shared/buddyChatCommands'
import {
  BUDDY_SERVICE_TIERS,
  BUDDY_THINKING_LEVELS,
  isBuddyThinkingLevel,
  resolveBuddyServiceTiers,
} from '../../shared/modelSelection'
import { toPublicRunEvent } from '../../shared/publicRunEvent'
import { BuddyAgentRunner } from './agent/BuddyAgentRunner'
import { BuddySessionRegistry } from './agent/BuddySessionRegistry'
import { resolveBuddySessionResources } from './agent/BuddySessionResources'
import { createBuddyRecoveryMessages } from './agent/createBuddyRecoveryMessages'
import {
  createBuddyContextSnapshot,
  createBuddySession,
} from './agent/createBuddySession'
import { createReusableBuddySession } from './agent/createReusableBuddySession'
import { createToolPolicyExtension } from './agent/extensions/toolPolicyExtension'
import { inspectCommittedPiCompaction } from './agent/inspectCommittedPiCompaction'
import {
  BuddySkillSelectionError,
  formatBuddySkillPrompt,
  SkillService,
} from './agent/SkillService'
import { ApprovalService } from './approvals/ApprovalService'
import { readSandboxedFile } from './approvals/FileSandbox'
import { prepareShellSandbox } from './approvals/ShellSandbox'
import { AttachmentService } from './attachments/AttachmentService'
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
import { AttentionNotificationService } from './notifications/AttentionNotificationService'
import { createPetTool, PET_TOOL_CLASSIFICATION } from './pet/createPetTool'
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
import { createApprovalRepository } from './storage/approvalRepository'
import { createAttachmentRepository } from './storage/attachmentRepository'
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
import { UsageService } from './usage/UsageService'

const WORKSPACE_STATE_KEY = 'buddy.chat.workspace.v4'
const INTERNAL_PROJECT_ID = 'lexora-buddy-workspace'
const MAX_CONTEXT_FILE_BYTES = 1024 * 1024
const MAX_MODEL_INPUT_BYTES = 4 * 1024 * 1024

const idSchema = z.string().trim().min(1).max(256)
const sessionIdentitySchema = z.string().regex(/^[A-Z0-9][\w-]{0,127}$/i)
const limitSchema = z.number().int().positive().max(500).optional()
const eventLimitSchema = z.number().int().positive().max(1_000).optional()
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
const startTurnSchema = z.object({
  attachmentIds: z.array(idSchema).max(16),
  branchId: sessionIdentitySchema.nullable(),
  content: z.string().max(2 * 1024 * 1024),
  contextItems: z.array(z.object({
    kind: z.enum(['file', 'skill', 'slashCommand']),
    value: z.string().min(1),
  }).strict()).max(64),
  conversationId: sessionIdentitySchema.nullable(),
  modelSelection: z.object({
    modelId: idSchema,
    providerId: idSchema,
    reasoning: z.enum(BUDDY_THINKING_LEVELS).nullable(),
    serviceTier: z.enum(BUDDY_SERVICE_TIERS).nullable(),
  }).strict().nullable(),
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
  modelSelection: z.object({
    modelId: idSchema,
    providerId: idSchema,
    reasoning: z.enum(BUDDY_THINKING_LEVELS).nullable(),
    serviceTier: z.enum(BUDDY_SERVICE_TIERS).nullable(),
  }).strict().nullable(),
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
  modelSelection: z.object({
    modelId: idSchema,
    providerId: idSchema,
    reasoning: z.enum(BUDDY_THINKING_LEVELS).nullable(),
    serviceTier: z.enum(BUDDY_SERVICE_TIERS).nullable(),
  }).strict(),
  projectId: idSchema.nullable(),
}).strict().refine(input => (
  (input.conversationId === null) === (input.branchId === null)
))

export interface StartBuddyServiceOptions {
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
  const agentDirectory = join(options.buddyHome, 'agent')
  const attachmentsDirectory = join(options.buddyHome, 'attachments')
  const managedProjectsDirectory = join(options.buddyHome, 'projects')
  const workspaceDirectory = join(options.buddyHome, 'workspace')
  await Promise.all([
    mkdir(agentDirectory, { mode: 0o700, recursive: true }),
    mkdir(attachmentsDirectory, { mode: 0o700, recursive: true }),
    mkdir(managedProjectsDirectory, { mode: 0o700, recursive: true }),
    mkdir(workspaceDirectory, { mode: 0o700, recursive: true }),
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
  const projectService = new ProjectGrantService(projectsRepository, { managedProjectsDirectory })
  const approvalService = new ApprovalService({
    eventLog: options.eventLog,
    repository: approvalsRepository,
  })
  const usageService = new UsageService({
    eventLog: options.eventLog,
    repository: usageRepository,
  })
  const attachmentService = new AttachmentService({
    directory: attachmentsDirectory,
    repository: createAttachmentRepository(options.database),
  })
  const providersRepository = createProviderRepository(options.database)
  const providerService = await createProviderService({
    agentDirectory,
    database: options.database,
    getActiveRuns: () => runs.listIncomplete(),
    peer: options.rpc,
    providers: providersRepository,
  })
  const notificationService = new AttentionNotificationService({
    attention: createNotificationAttentionRepository(options.database),
    listModels: () => providersRepository.listModelStates(),
  })
  const shellSandboxAssets = await prepareShellSandbox(agentDirectory)
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
  const runner = new BuddyAgentRunner({
    cancelPendingApprovals: () => approvalService.cancelPendingApprovals(),
    conversations,
    eventLog: options.eventLog,
    inspectCommittedCompaction: run => inspectCommittedPiCompaction({
      agentDirectory,
      branchId: run.branchId,
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
      const missingRecoveryAttachmentIds = new Set<string>()
      let recoveredImageCount = 0
      const petTool = createPetTool({
        getRunId: () => runContext.current?.runId,
        service: petService,
      })
      const classifications = new Map<string, BuddyToolClassification>(mcp.classifications)
      classifications.set(petTool.name, PET_TOOL_CLASSIFICATION)
      const grant = project
        ? {
            canonicalRoot: project.canonicalRoot,
            projectId: project.id,
            root: project.root,
          }
        : {
            canonicalRoot: workspaceDirectory,
            projectId: INTERNAL_PROJECT_ID,
            root: workspaceDirectory,
          }
      const session = await createBuddySession({
        agentDir: agentDirectory,
        branchId: input.branchId,
        bundledExtensions: [createToolPolicyExtension({
          approvalService,
          classifyTool: event => classifications.get(event.toolName) ?? {},
          cwd: input.canonicalRoot,
          getGrants: () => [grant],
          getRunContext: () => runContext.current,
        })],
        canonicalRoot: input.canonicalRoot,
        conversationId: input.conversationId,
        customTools: [...mcp.tools, petTool],
        cwd: input.canonicalRoot,
        getServiceTier: () => runContext.current?.serviceTier ?? null,
        model: selectedModel,
        modelRuntime: providerService.getSessionRuntime(),
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
        shellSandboxAssets,
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
        }),
      }
    },
  })
  const conversationLifecycle = new ConversationLifecycleService({
    agentDirectory,
    conversations,
    runner,
    sessions,
  })

  await projectService.recoverPendingDeletions()
  await conversationLifecycle.recoverPendingDeletions()
  await runner.recoverInterruptedRuns()
  await options.eventLog.compactTerminalRuns()

  const unregister = registerRuntimeHandlers({
    agentDirectory,
    approvalService,
    approvalsRepository,
    attachmentService,
    connectorService,
    connectorsRepository,
    commandRequests,
    conversations,
    conversationLifecycle,
    eventLog: options.eventLog,
    notificationService,
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
    shellSandboxAssets,
    usageRepository,
    turnRequests,
    workspace,
    workspaceDirectory,
  })
  return {
    async dispose() {
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
  attachmentService: AttachmentService
  connectorService: McpConnectorService
  connectorsRepository: ReturnType<typeof createConnectorRepository>
  commandRequests: ReturnType<typeof createCommandRequestRepository>
  conversations: ReturnType<typeof createConversationRepository>
  conversationLifecycle: ConversationLifecycleService
  eventLog: import('./events/RunEventLog').RunEventLog
  notificationService: AttentionNotificationService
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
  shellSandboxAssets: Awaited<ReturnType<typeof prepareShellSandbox>>
  usageRepository: ReturnType<typeof createUsageRepository>
  turnRequests: ReturnType<typeof createTurnRequestRepository>
  workspace: ReturnType<typeof createWorkspaceRepository>
  workspaceDirectory: string
}

function registerRuntimeHandlers(services: RuntimeServices): () => void {
  const disposers: Array<() => void> = []
  const on = (method: string, handler: (params: unknown) => Promise<unknown> | unknown) => {
    disposers.push(services.rpc.onRequest(method, handler))
  }
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
    await services.sessions.invalidateAll()
    return ok()
  })
  on('providers.clearCredential', async (params) => {
    const input = parse(z.object({ providerId: idSchema }).strict(), params)
    await services.providerService.clearCredential(input.providerId)
    await services.sessions.invalidateAll()
    return ok()
  })
  on('providers.remove', async (params) => {
    const input = parse(z.object({ providerId: idSchema }).strict(), params)
    await services.providerService.removeProvider(input.providerId)
    await services.sessions.invalidateAll()
    return ok()
  })
  on('providers.setEnabled', async (params) => {
    const input = parse(z.object({ enabled: z.boolean(), providerId: idSchema }).strict(), params)
    const provider = await services.providerService.setProviderEnabled(
      input.providerId,
      input.enabled,
    )
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
      root: z.string().min(1).nullable(),
    }).strict(), params)
    return services.projectService.create(input)
  })
  on('projects.update', async (params) => {
    const input = parse(z.object({
      instructions: z.string().trim().max(64 * 1024),
      memoryScope: z.enum(['personal_and_project', 'project_only']),
      name: z.string().trim().min(1).max(80),
      projectId: idSchema,
      root: z.string().min(1).nullable(),
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
        conversation.projectId !== input.projectId
        || !input.branchId
        || !services.conversations.listBranches(conversation.id).some(
          branch => branch.id === input.branchId,
        )
      )
    ) {
      throw new BuddyServiceError('VALIDATION_FAILED')
    }
    const projectId = conversation?.projectId ?? input.projectId
    const project = projectId
      ? requireActiveProject(services.projectsRepository.findById(projectId))
      : null
    const canonicalRoot = project?.canonicalRoot ?? services.workspaceDirectory
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
    const petTool = createPetTool({
      getRunId: () => undefined,
      service: services.petService,
    })
    const classifications = new Map<string, BuddyToolClassification>(mcp.classifications)
    classifications.set(petTool.name, PET_TOOL_CLASSIFICATION)
    const grant = project
      ? {
          canonicalRoot: project.canonicalRoot,
          projectId: project.id,
          root: project.root,
        }
      : {
          canonicalRoot: services.workspaceDirectory,
          projectId: INTERNAL_PROJECT_ID,
          root: services.workspaceDirectory,
        }
    const branchId = input.branchId ?? 'context-preview'
    const conversationId = conversation?.id ?? 'context-preview'
    const latestRun = conversation
      ? services.runs.findLatestForBranch(conversation.id, branchId)
      : null
    const snapshot = await createBuddyContextSnapshot({
      agentDir: services.agentDirectory,
      branchId,
      bundledExtensions: [createToolPolicyExtension({
        approvalService: services.approvalService,
        classifyTool: event => classifications.get(event.toolName) ?? {},
        cwd: canonicalRoot,
        getGrants: () => [grant],
        getRunContext: () => null,
      })],
      canonicalRoot,
      conversationId,
      customTools: [...mcp.tools, petTool],
      cwd: canonicalRoot,
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
      shellSandboxAssets: services.shellSandboxAssets,
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
  on('conversations.delete', async (params) => {
    const input = parse(z.object({ conversationId: idSchema }).strict(), params)
    return services.conversationLifecycle.delete(input.conversationId)
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
    if (services.conversations.isDeleting(input.conversationId))
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
    const items = withMessageAttachments(
      page.items,
      services.attachmentService.listForConversation(input.conversationId),
    )
    const messageItems = items.filter(item => item.kind === 'message')
    const runs = services.runs.listForTimeline(
      input.conversationId,
      branchId,
      messageItems.filter(item => item.role === 'user').map(item => item.id),
      messageItems.flatMap(item => item.runId ? [item.runId] : []),
    )
    return {
      items,
      nextCursor: page.nextBefore
        ? createConversationTimelineCursor({
            before: page.nextBefore,
            branchId,
            conversationId: input.conversationId,
          })
        : null,
      runEvents: services.eventLog.listForRuns(runs.map(run => run.id)).map(toPublicRunEvent),
      runs: runs.map(publicRun),
    }
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
    const input = parse(z.object({ paths: z.array(z.string().min(1)).max(16) }).strict(), params)
    return (await services.attachmentService.registerFiles(input.paths)).map(toPublicAttachment)
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
    const input = parse(z.object({ retainedAttachmentIds: z.array(idSchema) }).strict(), params)
    return {
      releasedAttachmentIds: await services.attachmentService.cleanupDrafts(
        input.retainedAttachmentIds,
      ),
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
    const canonicalRoot = project?.canonicalRoot ?? services.workspaceDirectory
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
    const canonicalRoot = project?.canonicalRoot ?? services.workspaceDirectory
    const conversationId = replay?.conversationId ?? input.conversationId ?? randomUUID()
    const existingConversation = services.conversations.findById(conversationId)
    if (existingConversation && existingConversation.projectId !== (project?.id ?? null))
      throw new BuddyServiceError('VALIDATION_FAILED')
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
    const prepared = replay
      ? services.turnRequests.retryInterrupted({
          createdAt: new Date().toISOString(),
          requestId: input.requestId,
          runId,
        })
      : services.turnRequests.prepare({
          branchId,
          conversationId,
          createdAt: new Date().toISOString(),
          model: selection.modelId,
          modelParameters: selection.contextWindow !== null && selection.maxTokens !== null
            ? { contextWindow: selection.contextWindow, maxTokens: selection.maxTokens }
            : undefined,
          projectId: project?.id ?? null,
          provider: selection.providerId,
          requestFingerprint,
          requestId: input.requestId,
          runInput: {
            attachmentIds: input.attachmentIds,
            contextItems: input.contextItems,
            prompt,
            reasoning: thinkingLevel ?? null,
            serviceTier: replayInput ? replayInput.serviceTier : selection.serviceTier,
          },
          runId,
          title: createConversationTitle(input.content, attachmentPrompt.records),
          userMessageContent: {
            attachmentIds: input.attachmentIds,
            contextItems: input.contextItems,
            text: input.content,
          },
          userMessageId: randomUUID(),
        })
    if (!prepared.created) {
      return turnStart(
        prepared,
        requireValue(services.runs.findById(prepared.runId), 'VALIDATION_FAILED'),
      )
    }
    const preparedRun = requireValue(services.runs.findById(prepared.runId), 'VALIDATION_FAILED')
    const turn = services.runner.startTurn({
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
    const canonicalRoot = project?.canonicalRoot ?? services.workspaceDirectory
    const replayInput = replayRun ? services.runInputs.findByRunId(replayRun.id) : null
    if (replayRun && !replayInput)
      throw new BuddyServiceError('VALIDATION_FAILED')
    const attachmentIds = replayInput?.attachmentIds ?? input.attachmentIds
    const attachmentPrompt = await services.attachmentService.materializePrompt(
      attachmentIds,
      replayInput ? '' : input.content,
      conversation.id,
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
    const prepared = replay
      ? services.turnRequests.retryInterrupted({
          createdAt: new Date().toISOString(),
          requestId: input.requestId,
          runId,
        })
      : services.turnRequests.edit({
          branchId: randomUUID(),
          conversationId: conversation.id,
          createdAt: new Date().toISOString(),
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
            attachmentIds: input.attachmentIds,
            contextItems: input.contextItems,
            prompt,
            reasoning: thinkingLevel ?? null,
            serviceTier: replayInput ? replayInput.serviceTier : selection.serviceTier,
          },
          sourceUserMessageId: input.userMessageId,
          title: null,
          userMessageContent: {
            attachmentIds: input.attachmentIds,
            contextItems: input.contextItems,
            text: input.content,
          },
          userMessageId: randomUUID(),
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
    const turn = services.runner.startTurn({
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
    const canonicalRoot = project?.canonicalRoot ?? services.workspaceDirectory
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
    const turn = services.runner.startTurn({
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
    const content = await readSandboxedFile(project.canonicalRoot, resolution.canonicalPath)
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

function toPublicApproval(approval: ApprovalRecord) {
  const kind = new Set(['delete', 'mcp', 'network', 'shell', 'system']).has(approval.kind)
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
