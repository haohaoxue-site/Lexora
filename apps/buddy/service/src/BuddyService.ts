import type { DatabaseSync } from 'node:sqlite'
import type {
  AutomationStartupContext,
} from '../../shared/automation'

import type { BuddySessionCompositionServices } from './agent/createBuddySessionComposition'
import type { BuddyAgentSessionLike } from './agent/PiTurnExecutor'
import type { AutomationClock } from './automations/AutomationScheduleEvaluator'
import type { BuddyRuntime } from './BuddyRuntime'
import type { RunEventLogPort } from './events/RunEventPorts'
import type { BuddyServiceRpcServer } from './rpc/BuddyServiceRpcServer'
import type { BuddyServiceErrorCode } from './rpc/runtimeRequest'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { BuddyAgentRunner } from './agent/BuddyAgentRunner'
import { BuddyRunExecutionPlanner } from './agent/BuddyRunExecutionPlanner'
import { BuddySessionBlueprintService } from './agent/BuddySessionBlueprint'
import { BuddySessionFactory } from './agent/BuddySessionFactory'
import { BuddySessionRecoveryService } from './agent/BuddySessionRecoveryService'
import { BuddySessionRegistry } from './agent/BuddySessionRegistry'
import { BuddyTurnLauncher } from './agent/BuddyTurnLauncher'
import { inspectCommittedPiCompaction } from './agent/inspectCommittedPiCompaction'
import { PiEventBridge } from './agent/PiEventBridge'
import { PiTurnExecutor } from './agent/PiTurnExecutor'
import {
  registerSkillServiceRpc,
  SkillService,
} from './agent/SkillService'
import { ApprovalService } from './approvals/ApprovalService'
import { registerApprovalRpc } from './approvals/registerApprovalRpc'
import { ArtifactService } from './artifacts/ArtifactService'
import { registerArtifactRpc } from './artifacts/registerArtifactRpc'
import { AttachmentService } from './attachments/AttachmentService'
import { registerAttachmentRpc } from './attachments/registerAttachmentRpc'
import { AutomationChangeCoordinator } from './automations/AutomationChangeCoordinator'
import { AutomationDispatcher } from './automations/AutomationDispatcher'
import { AutomationOccurrenceLifecycleService } from './automations/AutomationOccurrenceLifecycleService'
import { systemAutomationClock } from './automations/AutomationScheduleEvaluator'
import { AutomationScheduler } from './automations/AutomationScheduler'
import { AutomationService } from './automations/AutomationService'
import { registerAutomationRpc } from './automations/registerAutomationRpc'
import { resolveAutomationModelSelection } from './automations/resolveAutomationModelSelection'
import { ChangeCaptureService } from './changes/ChangeCaptureService'
import { createChangeSetRepository } from './changes/changeSetRepository'
import { registerChangeRpc } from './changes/registerChangeRpc'
import { ChatCommandService } from './chat/ChatCommandService'
import { ChatTurnService } from './chat/ChatTurnService'
import { registerChatRpc } from './chat/registerChatRpc'
import {
  HostConnectorSecretStore,
  McpConnectorService,
} from './connectors/mcp/McpConnectorService'
import { registerMcpConnectorRpc } from './connectors/mcp/registerMcpConnectorRpc'
import { ContextUsageSnapshotService } from './context/ContextUsageSnapshotService'
import { registerContextRpc } from './context/registerContextRpc'
import { ConversationLifecycleService } from './conversations/ConversationLifecycleService'
import { registerConversationRpc } from './conversations/registerConversationRpc'
import { ImageTransformService } from './images/ImageTransformService'
import { OpenAiImageGenerationService } from './images/OpenAiImageGenerationService'
import { AttentionNotificationService } from './notifications/AttentionNotificationService'
import { registerNotificationRpc } from './notifications/registerNotificationRpc'
import { PetActionService } from './pet/PetActionService'
import { createProviderService } from './providers/createProviderService'
import { registerProviderRpc } from './providers/registerProviderRpc'
import { resolveInteractiveModelSelection } from './providers/resolveInteractiveModelSelection'
import { BuddyServiceError } from './rpc/runtimeRequest'
import { registerRunRpc } from './runs/registerRunRpc'
import { RunLifecycleService } from './runs/RunLifecycleService'

import { RunRecoveryService } from './runs/RunRecoveryService'
import { registerSpaceRpc } from './spaces/registerSpaceRpc'
import { SpaceDirectoryAuthorizationService } from './spaces/SpaceDirectoryAuthorizationService'
import { matchesSpaceExecutionContext } from './spaces/spaceExecutionContext'
import { SpaceService } from './spaces/SpaceService'
import { createApprovalRepository } from './storage/approvalRepository'
import { createArtifactRepository } from './storage/artifactRepository'
import { createAttachmentRepository } from './storage/attachmentRepository'
import { createAutomationRepositories } from './storage/automationRepository'
import { createAutomationTurnRepository } from './storage/automationTurnRepository'
import { BuddyDataPaths } from './storage/BuddyDataPaths'
import { createCommandRequestRepository } from './storage/commandRequestRepository'
import { createConnectorRepository } from './storage/connectorRepository'
import { createConversationRepository } from './storage/conversationRepository'
import { createNotificationAttentionRepository } from './storage/notificationAttentionRepository'
import { createProviderRepository } from './storage/providerRepository'
import { createRunInputRepository } from './storage/runInputRepository'
import { createRunRepository } from './storage/runRepository'
import { createSpaceRepository } from './storage/spaceRepository'
import { createTurnRequestRepository } from './storage/turnRequestRepository'
import { createUsageRepository } from './storage/usageRepository'
import { createWorkspaceRepository } from './storage/workspaceRepository'
import { LinuxSystemHost } from './system/LinuxSystemHost'
import { registerUsageRpc } from './usage/registerUsageRpc'
import { UsageService } from './usage/UsageService'
import { registerWorkspaceStateRpc } from './workspace/registerWorkspaceStateRpc'

export interface StartBuddyServiceOptions {
  automationClock?: AutomationClock
  automationStartupContext?: AutomationStartupContext
  buddyHome: string
  builtinSkillsDirectory: string
  database: DatabaseSync
  rpc: BuddyServiceRpcServer
  eventLog: RunEventLogPort
}

export interface BuddyServiceHandle {
  dispose: () => Promise<void>
  runtime: BuddyRuntime
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

  const spacesRepository = createSpaceRepository(options.database)
  const conversations = createConversationRepository(options.database)
  const runs = createRunRepository(options.database)
  const runInputs = createRunInputRepository(options.database)
  const approvalsRepository = createApprovalRepository(options.database)
  const usageRepository = createUsageRepository(options.database)
  const workspace = createWorkspaceRepository(options.database)
  const turnRequests = createTurnRequestRepository(options.database)
  const commandRequests = createCommandRequestRepository(options.database)
  const connectorsRepository = createConnectorRepository(options.database)
  const spaceService = new SpaceService(spacesRepository)
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
  const piEventBridge = new PiEventBridge({
    eventLog: options.eventLog,
    usage: usageService,
  })
  const runLifecycleService = new RunLifecycleService({
    eventLog: options.eventLog,
    repository: runs,
  })
  const changeCaptureService = new ChangeCaptureService({
    paths,
    repository: createChangeSetRepository(options.database),
  })
  const runRecoveryService = new RunRecoveryService({
    cancelPendingApprovals: () => approvalService.cancelPendingApprovals(),
    captureInterruptedChanges: async (runId) => {
      await changeCaptureService.markInterrupted(runId)
    },
    conversations,
    eventLog: options.eventLog,
    lifecycle: runLifecycleService,
    inspectCommittedCompaction: run => inspectCommittedPiCompaction({
      branchId: run.branchId,
      conversationsDirectory: paths.conversationsDirectory,
      conversationId: run.conversationId,
      piSessionFile: requireValue(run.piSessionFile, 'VALIDATION_FAILED'),
      startedAt: run.startedAt,
    }),
    repository: runs,
    usage: usageService,
  })
  const attachmentService = new AttachmentService({
    paths,
    repository: createAttachmentRepository(options.database),
  })
  const artifactsRepository = createArtifactRepository(options.database)
  const artifactService = new ArtifactService({ paths, repository: artifactsRepository })
  const imageTransformService = new ImageTransformService({ artifacts: artifactService })
  const providersRepository = createProviderRepository(options.database)
  const providerService = await createProviderService({
    agentDirectory,
    database: options.database,
    getActiveRuns: () => runs.listIncomplete(),
    peer: options.rpc,
    providers: providersRepository,
  })
  const executionModels = providerService.executionModels
  const imageGenerationGateway = new OpenAiImageGenerationService({
    modelRuntime: executionModels.getRuntime(),
  })
  const systemHost = new LinuxSystemHost()
  const sessions = new BuddySessionRegistry<BuddyAgentSessionLike>()
  const directoryAuthorization = new SpaceDirectoryAuthorizationService({
    host: options.rpc,
    onGranted: spaceId => sessions.invalidateSpace(spaceId),
    spaces: spaceService,
  })
  const connectorService = new McpConnectorService({
    connectors: connectorsRepository,
    invalidateSessions: () => sessions.invalidateAll(),
    notify: event => options.rpc.notify(event.type, event),
    secrets: new HostConnectorSecretStore(options.rpc),
  })
  const skillService = new SkillService({
    agentDirectory,
    builtinSkillsDirectory: options.builtinSkillsDirectory,
    spaces: spacesRepository,
  })
  const petService = new PetActionService({
    eventSink: event => options.eventLog.append(event),
    peer: options.rpc,
  })
  const automationClock = options.automationClock ?? systemAutomationClock
  const automationRepositories = createAutomationRepositories(options.database)
  const automationTurns = createAutomationTurnRepository(options.database)
  const automationService = new AutomationService({
    clock: automationClock,
    repositories: automationRepositories,
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
    listModels: () => providersRepository.models.list(),
  })
  let automationScheduler: AutomationScheduler | null = null
  const automationChanges = new AutomationChangeCoordinator({
    notify: automationId => options.rpc.notify('automation.changed', { automationId }),
    service: automationService,
    wakeScheduler: () => automationScheduler?.wake(),
  })
  automationChanges.reconcileDependencies({
    isPinnedModelAvailable(providerId, modelId) {
      const provider = providersRepository.states.findByProviderId(providerId)
      const model = providersRepository.models.find(providerId, modelId)
      return Boolean(provider?.enabled && model?.enabled && model.available)
    },
    isSpaceAvailable(spaceId) {
      const space = spacesRepository.findById(spaceId)
      return Boolean(space && space.revokedAt === null)
    },
  })
  const sessionCompositionServices: BuddySessionCompositionServices = {
    approvalService,
    artifactService,
    attachmentService,
    automationService,
    changeCaptureService,
    connectorService,
    directoryAuthorization,
    imageGenerationGateway,
    imageTransformService,
    onAutomationChanged: automationId => automationChanges.publish(automationId),
    petService,
    systemHost,
  }
  const sessionBlueprints = new BuddySessionBlueprintService({
    paths,
    spaces: spacesRepository,
    skills: skillService,
  })
  const sessionRecovery = new BuddySessionRecoveryService({
    attachments: attachmentService,
    conversations,
    models: executionModels,
    runInputs,
    runs,
  })
  const sessionFactory = new BuddySessionFactory({
    agentDirectory,
    conversations,
    conversationsDirectory: paths.conversationsDirectory,
    models: executionModels,
    recovery: sessionRecovery,
    runs,
    services: sessionCompositionServices,
  })
  const piTurnExecutor = new PiTurnExecutor({
    eventLog: options.eventLog,
    piEvents: piEventBridge,
    runs,
    sessionFactory: input => sessionFactory.create(input),
    sessions,
  })
  runner = new BuddyAgentRunner({
    executor: piTurnExecutor,
    lifecycle: runLifecycleService,
    sessions,
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
    onChanged: automationId => automationChanges.publish(automationId),
  })
  const executionPlanner = new BuddyRunExecutionPlanner({
    attachments: attachmentService,
    commands: commandRequests,
    conversations,
    runInputs,
    runs,
    sessions: sessionBlueprints,
  })
  const turnLauncher = new BuddyTurnLauncher({
    lifecycle: runLifecycleService,
    planner: executionPlanner,
    runner,
  })
  const chatCommandService = new ChatCommandService({
    commands: commandRequests,
    conversationLifecycle,
    conversations,
    spaces: spacesRepository,
    runs,
    turnLauncher,
  })
  const chatTurnService = new ChatTurnService({
    attachments: attachmentService,
    conversationLifecycle,
    conversations,
    spaces: spacesRepository,
    providers: providerService,
    runInputs,
    runner,
    runs,
    skills: skillService,
    turnLauncher,
    turnRequests,
  })
  const runtime: BuddyRuntime = {
    startTurn: input => chatTurnService.start(input),
  }
  const contextUsageService = new ContextUsageSnapshotService({
    agentDirectory,
    blueprints: sessionBlueprints,
    conversations,
    models: executionModels,
    paths,
    recovery: sessionRecovery,
    runs,
    sessionCompositionServices,
  })
  const automationDispatcher = new AutomationDispatcher({
    automationService,
    cancelRun: (runId, errorCode) => runner.cancel(runId, errorCode),
    clock: automationClock,
    launchTurn: runId => turnLauncher.launch(runId),
    resolveModel: target => resolveAutomationModelSelection({
      defaults: providerService,
      models: executionModels,
    }, target),
    resolveSpace: async (spaceId, executionContext) => {
      const space = spacesRepository.findById(spaceId)
      if (!space || space.revokedAt !== null)
        return null
      if (!matchesSpaceExecutionContext(space, executionContext))
        return { status: 'context_changed' }
      return { executionContext, id: space.id, status: 'ready' }
    },
    turns: automationTurns,
  })
  const scheduler = new AutomationScheduler({
    automationService,
    clock: automationClock,
    dispatch: async (occurrence) => {
      await automationDispatcher.dispatch(occurrence)
      automationChanges.publishSchedulerChange(occurrence.automationId)
    },
    onChanged: automationId => automationChanges.publishSchedulerChange(automationId),
    workspace,
  })
  automationScheduler = scheduler

  await conversationLifecycle.recoverPendingDeletions()
  await runRecoveryService.recoverInterruptedRuns()
  await options.eventLog.compactTerminalRuns()

  const unregister = combineDisposers(
    registerNotificationRpc({
      rpc: options.rpc,
      service: notificationService,
    }),
    registerWorkspaceStateRpc({
      repository: workspace,
      rpc: options.rpc,
    }),
    registerArtifactRpc({
      rpc: options.rpc,
      service: artifactService,
    }),
    registerChangeRpc({
      rpc: options.rpc,
      service: changeCaptureService,
    }),
    registerRunRpc({
      eventLog: options.eventLog,
      inputs: runInputs,
      repository: runs,
      rpc: options.rpc,
    }),
    registerAttachmentRpc({
      rpc: options.rpc,
      service: attachmentService,
    }),
    registerUsageRpc({
      repository: usageRepository,
      rpc: options.rpc,
    }),
    registerChatRpc({
      commands: chatCommandService,
      rpc: options.rpc,
      runtime,
      turns: chatTurnService,
    }),
    registerContextRpc({
      rpc: options.rpc,
      service: contextUsageService,
    }),
    registerConversationRpc({
      artifacts: artifactsRepository,
      attachments: attachmentService,
      changes: changeCaptureService,
      conversations,
      deleteConversation: async (conversationId) => {
        const result = await automationOccurrenceLifecycle.deleteConversation(conversationId)
        return result.deleted
      },
      eventLog: options.eventLog,
      isDeleting: conversationId => conversationLifecycle.isDeleting(conversationId),
      resolveModelSelection: selection => resolveInteractiveModelSelection(
        providerService,
        selection,
      ),
      rpc: options.rpc,
      runInputs,
      runs,
      sessions,
    }),
    registerApprovalRpc({
      repository: approvalsRepository,
      rpc: options.rpc,
      service: approvalService,
    }),
    registerAutomationRpc({
      approvals: approvalsRepository,
      changes: automationChanges,
      clock: automationClock,
      lifecycle: automationOccurrenceLifecycle,
      rpc: options.rpc,
      runs,
      service: automationService,
    }),
    registerMcpConnectorRpc(options.rpc, connectorService),
    registerSpaceRpc({
      automations: automationChanges,
      spaces: spacesRepository,
      rpc: options.rpc,
      service: spaceService,
      sessions,
    }),
    registerProviderRpc({
      automations: automationChanges,
      rpc: options.rpc,
      service: providerService,
      sessions,
    }),
    registerSkillServiceRpc(options.rpc, skillService),
  )
  let disposal: Promise<void> | null = null
  const dispose = () => {
    disposal ??= (async () => {
      unregister()
      await Promise.allSettled([
        scheduler.dispose(),
        runner.dispose(),
        connectorService.close(),
      ])
    })()
    return disposal
  }
  try {
    await scheduler.start(options.automationStartupContext ?? {
      reason: 'normal',
      restoreToken: null,
    })
  }
  catch (error) {
    await dispose()
    throw error
  }
  return { dispose, runtime }
}

function combineDisposers(...disposers: Array<() => void>): () => void {
  return () => {
    for (const dispose of disposers.splice(0).reverse()) {
      try {
        dispose()
      }
      catch {}
    }
  }
}

function requireValue<T>(value: T | null, code: BuddyServiceErrorCode): T {
  if (value === null)
    throw new BuddyServiceError(code)
  return value
}
