import type { DatabaseSync } from 'node:sqlite'
import type {
  AutomationModelTarget,
  AutomationOccurrence,
} from '../../../shared/automation'
import type { BuddyThinkingLevel } from '../../../shared/modelSelection'
import type {
  BuddyTurnHandle,
  StartBuddyTurnInput,
} from '../agent/BuddyAgentRunner'
import type { BuddySessionResources } from '../agent/BuddySessionResources'
import type { ProjectMemoryScope } from '../storage/projectRepository'
import type { AutomationClock } from './AutomationScheduleEvaluator'
import type { AutomationService } from './AutomationService'
import { randomUUID } from 'node:crypto'
import { createAutomationTurnRepository } from '../storage/automationTurnRepository'
import { createRunRepository } from '../storage/runRepository'
import { systemAutomationClock } from './AutomationScheduleEvaluator'

export const AUTOMATION_RUN_TIMEOUT_MS = 90 * 60 * 1_000

export interface ResolvedAutomationModel {
  contextWindow: number
  maxTokens: number
  modelId: string
  providerId: string
  reasoning: BuddyThinkingLevel | null
}

export interface ResolvedAutomationProject {
  canonicalRoot: string
  id: string
  instructions: string
  memoryScope: ProjectMemoryScope
}

export interface AutomationDispatcherOptions {
  automationService: AutomationService
  cancelRun?: (runId: string, errorCode: string) => Promise<boolean>
  clock?: AutomationClock
  createId?: () => string
  database: DatabaseSync
  launchTurn: (input: StartBuddyTurnInput) => BuddyTurnHandle
  resolveConversationWorkspace: (conversationId: string) => Promise<string>
  resolveModel: (target: AutomationModelTarget) => Promise<ResolvedAutomationModel | null>
  resolveProject: (projectId: string) => Promise<ResolvedAutomationProject | null>
    | ResolvedAutomationProject
    | null
  resolveResources: (input: {
    canonicalRoot: string
    project: ResolvedAutomationProject | null
  }) => Promise<BuddySessionResources>
  runTimeoutMs?: number
}

export class AutomationDispatcher {
  readonly #automationService: AutomationService
  readonly #cancelRun: NonNullable<AutomationDispatcherOptions['cancelRun']>
  readonly #clock: AutomationClock
  readonly #createId: () => string
  readonly #launchTurn: AutomationDispatcherOptions['launchTurn']
  readonly #resolveConversationWorkspace: AutomationDispatcherOptions['resolveConversationWorkspace']
  readonly #resolveModel: AutomationDispatcherOptions['resolveModel']
  readonly #resolveProject: AutomationDispatcherOptions['resolveProject']
  readonly #resolveResources: AutomationDispatcherOptions['resolveResources']
  readonly #runTimeoutMs: number
  readonly #runs: ReturnType<typeof createRunRepository>
  readonly #turns: ReturnType<typeof createAutomationTurnRepository>

  constructor(options: AutomationDispatcherOptions) {
    this.#automationService = options.automationService
    this.#cancelRun = options.cancelRun ?? (async () => false)
    this.#clock = options.clock ?? systemAutomationClock
    this.#createId = options.createId ?? randomUUID
    this.#launchTurn = options.launchTurn
    this.#resolveConversationWorkspace = options.resolveConversationWorkspace
    this.#resolveModel = options.resolveModel
    this.#resolveProject = options.resolveProject
    this.#resolveResources = options.resolveResources
    this.#runTimeoutMs = options.runTimeoutMs ?? AUTOMATION_RUN_TIMEOUT_MS
    this.#runs = createRunRepository(options.database)
    this.#turns = createAutomationTurnRepository(options.database)
  }

  async dispatch(candidate: AutomationOccurrence): Promise<void> {
    const occurrence = this.#automationService.getOccurrence(candidate.id)
    if (
      !occurrence
      || occurrence.status !== 'queued'
      || occurrence.runId
      || !occurrence.leaseOwner
    ) {
      return
    }
    const snapshot = occurrence.executionSnapshot
    const model = await this.#resolveModel(snapshot.model)
    if (!model) {
      const errorCode = snapshot.model.mode === 'pinned'
        ? 'AUTOMATION_PINNED_MODEL_UNAVAILABLE'
        : 'AUTOMATION_DEFAULT_MODEL_UNAVAILABLE'
      if (snapshot.model.mode === 'pinned') {
        this.#automationService.finishQueuedAndBlock({
          automationId: occurrence.automationId,
          expectedRevision: occurrence.automationRevision,
          id: occurrence.id,
          leaseOwner: occurrence.leaseOwner,
          reason: 'AUTOMATION_PINNED_MODEL_UNAVAILABLE',
        })
      }
      else {
        this.#automationService.finishQueued({
          errorCode,
          id: occurrence.id,
          leaseOwner: occurrence.leaseOwner,
          status: 'skipped',
        })
      }
      return
    }

    const project = snapshot.projectId
      ? await this.#resolveProject(snapshot.projectId)
      : null
    if (snapshot.projectId && !project) {
      this.#skipAndBlock(
        occurrence.id,
        occurrence.leaseOwner,
        occurrence.automationId,
        occurrence.automationRevision,
        'AUTOMATION_PROJECT_UNAVAILABLE',
      )
      return
    }

    const branchId = this.#createId()
    const conversationId = this.#createId()
    const messageId = this.#createId()
    const runId = this.#createId()
    const boundAt = formatInstant(this.#clock.now())
    const binding = this.#turns.bind({
      boundAt,
      branchId,
      contextWindow: model.contextWindow,
      conversationId,
      leaseOwner: occurrence.leaseOwner,
      maxTokens: model.maxTokens,
      messageId,
      model: model.modelId,
      occurrenceId: occurrence.id,
      projectId: project?.id ?? null,
      provider: model.providerId,
      reasoning: model.reasoning,
      runId,
    })
    if (binding.kind === 'overlap_skipped')
      return
    const bound = binding
    let turn: BuddyTurnHandle
    try {
      const canonicalRoot = project?.canonicalRoot
        ?? await this.#resolveConversationWorkspace(conversationId)
      const resources = await this.#resolveResources({ canonicalRoot, project })
      turn = this.#launchTurn({
        branchId: bound.run.branchId,
        canonicalRoot,
        conversationId: bound.conversation.id,
        cwd: canonicalRoot,
        memoryScope: project?.memoryScope ?? null,
        model: bound.run.model,
        projectId: project?.id ?? null,
        prompt: snapshot.prompt,
        provider: bound.run.provider,
        resources,
        runId: bound.run.id,
        sessionMode: 'automation_background',
        thinkingLevel: model.reasoning ?? undefined,
      })
    }
    catch (error) {
      this.#runs.updateStatus(bound.run.id, 'failed', boundAt, 'RUNTIME_RESTARTED')
      throw error
    }
    await this.#waitForTurn(turn)
  }

  async #waitForTurn(turn: BuddyTurnHandle): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | null = null
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(resolve, this.#runTimeoutMs, 'timeout')
      timer.unref?.()
    })
    try {
      const result = await Promise.race([
        turn.completion.then(() => 'completed' as const),
        timeout,
      ])
      if (result === 'completed')
        return
      await this.#cancelRun(turn.runId, 'AUTOMATION_RUN_TIMEOUT')
      await turn.completion
    }
    finally {
      if (timer)
        clearTimeout(timer)
    }
  }

  #skipAndBlock(
    occurrenceId: string,
    leaseOwner: string,
    automationId: string,
    expectedRevision: number,
    reason: 'AUTOMATION_PROJECT_UNAVAILABLE',
  ): void {
    this.#automationService.finishQueuedAndBlock({
      automationId,
      expectedRevision,
      id: occurrenceId,
      leaseOwner,
      reason,
    })
  }
}

function formatInstant(value: Temporal.Instant): string {
  return value.toString({ smallestUnit: 'millisecond' })
}
