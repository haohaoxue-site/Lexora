import type { ImageContent } from '@earendil-works/pi-ai'
import type { AgentSessionEvent, CompactionResult } from '@earendil-works/pi-coding-agent'
import type { BuddyServiceTier } from '../../../shared/modelSelection'
import type { RunEventLog } from '../events/RunEventLog'
import type { ConversationRepository } from '../storage/conversationRepository'
import type { ProjectMemoryScope } from '../storage/projectRepository'
import type { RunRecord, RunRepository, RunStatus } from '../storage/runRepository'
import type { BuddyUsagePurpose } from '../usage/recordPiUsage'
import type { UsageService } from '../usage/UsageService'
import type {
  BuddySessionBinding,
  BuddySessionIdentity,
} from './BuddySessionRegistry'
import type { BuddySessionResources } from './BuddySessionResources'
import type { BuddyContextUsageBreakdown } from './contextUsageBreakdown'
import type { BuddySessionShutdownReason, CreateBuddySessionOptions } from './createBuddySession'
import type { CommittedPiCompactionEvidence } from './inspectCommittedPiCompaction'
import type { BuddyProjectedEvent, ProjectedArtifact } from './projectPiEvent'
import { createHash, randomUUID } from 'node:crypto'

import { isAbsolute, resolve } from 'node:path'
import { createBuddyInterruptedMessageContent } from '../../../shared/buddyMessageContent'
import { buddyReasoningKindSchema } from '../../../shared/reasoningPresentation'
import { createInterruptedMessageEvents } from '../events/createInterruptedMessageEvents'
import { RunEventLogFatalError } from '../events/RunEventLog'
import { resolveGrantedPath } from '../projects/resolveGrantedPath'
import { BuddySessionRegistry } from './BuddySessionRegistry'
import {
  createPiEventProjectionState,
  projectPiEvent,
} from './projectPiEvent'

export interface BuddyAgentSessionLike {
  abort: () => Promise<void>
  abortCompaction: () => void
  canCompact: () => boolean
  activateTurn: (input: BuddySessionTurnContext) => Promise<() => void>
  compact: (customInstructions?: string) => Promise<CompactionResult>
  getContextUsageBreakdown?: (
    totalTokens: number,
  ) => BuddyContextUsageBreakdown | null | Promise<BuddyContextUsageBreakdown | null>
  prompt: (text: string, options?: {
    expandPromptTemplates?: boolean
    images?: ImageContent[]
    source?: 'rpc'
  }) => Promise<void>
  subscribe: (listener: (event: AgentSessionEvent) => void) => () => void
  shutdown: (reason: BuddySessionShutdownReason) => Promise<void>
  waitForIdle: () => Promise<void>
}

export interface BuddySessionTurnContext {
  contextWindow: number | null
  maxTokens: number | null
  model: string
  provider: string
  runId: string
  serviceTier?: BuddyServiceTier | null
  signal: AbortSignal
  thinkingLevel?: CreateBuddySessionOptions['thinkingLevel']
}

export interface BuddySessionFactoryInput extends BuddySessionIdentity {
  piSessionFile: string | null
  resources: BuddySessionResources
  runId: string
  signal: AbortSignal
  thinkingLevel?: CreateBuddySessionOptions['thinkingLevel']
}

export interface BuddyAgentRunnerOptions {
  cancelPendingApprovals?: () => Promise<number>
  conversations: ConversationRepository
  eventLog: RunEventLog
  inspectCommittedCompaction?: (
    run: RunRecord,
  ) => Promise<CommittedPiCompactionEvidence | null>
  runs: RunRepository
  sessionFactory: (
    input: BuddySessionFactoryInput,
  ) => Promise<BuddySessionBinding<BuddyAgentSessionLike>>
  sessions?: BuddySessionRegistry<BuddyAgentSessionLike>
  usage: UsageService
}

export interface StartBuddyTurnInput {
  branchId: string
  canonicalRoot: string
  conversationId: string
  cwd: string
  model: string
  images?: ImageContent[]
  memoryScope?: ProjectMemoryScope | null
  projectId: string | null
  prompt: string
  provider: string
  resources: BuddySessionResources
  runId: string
  serviceTier?: BuddyServiceTier | null
  thinkingLevel?: CreateBuddySessionOptions['thinkingLevel']
}

export interface StartBuddyCompactionInput {
  branchId: string
  canonicalRoot: string
  conversationId: string
  customInstructions?: string
  cwd: string
  memoryScope?: ProjectMemoryScope | null
  projectId: string | null
  resources: BuddySessionResources
  runId: string
  thinkingLevel?: CreateBuddySessionOptions['thinkingLevel']
}

export interface BuddyTurnHandle {
  completion: Promise<RunRecord>
  runId: string
}

interface TurnExecution {
  controller: AbortController
  identity: BuddySessionIdentity
  input: StartBuddyTurnInput
  runId: string
}

interface ActiveRunExecution {
  controller: AbortController
  completion: Promise<RunRecord>
  identity: BuddySessionIdentity
  runId: string
}

export class BuddyAgentRunner {
  readonly #activeSessions = new Map<string, BuddyAgentSessionLike>()
  readonly #cancelPendingApprovals?: () => Promise<number>
  readonly #controllers = new Map<string, AbortController>()
  readonly #conversations: ConversationRepository
  readonly #eventLog: RunEventLog
  readonly #inspectCommittedCompaction?: BuddyAgentRunnerOptions['inspectCommittedCompaction']
  readonly #runs: RunRepository
  readonly #sessionFactory: BuddyAgentRunnerOptions['sessionFactory']
  readonly #sessions: BuddySessionRegistry<BuddyAgentSessionLike>
  readonly #usage: UsageService
  readonly #executions = new Map<string, ActiveRunExecution>()
  #lastTimestamp = 0

  constructor(options: BuddyAgentRunnerOptions) {
    this.#cancelPendingApprovals = options.cancelPendingApprovals
    this.#conversations = options.conversations
    this.#eventLog = options.eventLog
    this.#inspectCommittedCompaction = options.inspectCommittedCompaction
    this.#runs = options.runs
    this.#sessionFactory = options.sessionFactory
    this.#sessions = options.sessions ?? new BuddySessionRegistry()
    this.#usage = options.usage
  }

  startTurn(input: StartBuddyTurnInput): BuddyTurnHandle {
    if (!input.prompt.trim())
      throw new BuddyAgentRunError('VALIDATION_FAILED')

    const runId = input.runId
    const conversation = this.#conversations.findById(input.conversationId)
    const run = this.#runs.findById(runId)
    if (
      !conversation
      || !run
      || conversation.projectId !== input.projectId
      || run.conversationId !== input.conversationId
      || run.branchId !== input.branchId
    ) {
      throw new BuddyAgentRunError('CONVERSATION_BINDING_MISMATCH')
    }

    const controller = new AbortController()
    const identity = {
      branchId: input.branchId,
      canonicalRoot: input.canonicalRoot,
      conversationId: input.conversationId,
      resourceRevision: input.resources.revision,
    }
    this.#controllers.set(runId, controller)
    const execution = { controller, identity, input, runId }
    const completion = this.#sessions.withBranchRun(
      identity,
      runId,
      controller.signal,
      () => this.#executeTurn(execution),
    ).catch(error => this.#closeExecutionFromError(
      identity,
      runId,
      controller.signal,
      error,
    )).finally(() => {
      this.#activeSessions.delete(runId)
      this.#controllers.delete(runId)
      this.#executions.delete(runId)
    })
    this.#executions.set(runId, { completion, controller, identity, runId })
    return { completion, runId }
  }

  startCompaction(input: StartBuddyCompactionInput): BuddyTurnHandle {
    const run = this.#runs.findById(input.runId)
    const conversation = this.#conversations.findById(input.conversationId)
    if (
      !conversation
      || !run
      || conversation.projectId !== input.projectId
      || run.conversationId !== input.conversationId
      || run.branchId !== input.branchId
      || run.purpose !== 'conversation.compaction'
      || !run.piSessionFile
    ) {
      throw new BuddyAgentRunError('CONVERSATION_BINDING_MISMATCH')
    }

    const controller = new AbortController()
    const identity = {
      branchId: input.branchId,
      canonicalRoot: input.canonicalRoot,
      conversationId: input.conversationId,
      resourceRevision: input.resources.revision,
    }
    this.#controllers.set(run.id, controller)
    const completion = this.#sessions.withBranchRun(
      identity,
      run.id,
      controller.signal,
      () => this.#executeCompaction(input, identity, controller, run),
    ).catch(error => this.#closeExecutionFromError(
      identity,
      run.id,
      controller.signal,
      error,
    )).finally(() => {
      this.#activeSessions.delete(run.id)
      this.#controllers.delete(run.id)
      this.#executions.delete(run.id)
    })
    this.#executions.set(run.id, {
      completion,
      controller,
      identity,
      runId: run.id,
    })
    return { completion, runId: run.id }
  }

  async cancel(runId: string): Promise<boolean> {
    const execution = this.#executions.get(runId)
    if (!execution)
      return false
    execution.controller.abort()
    const session = this.#activeSessions.get(runId)
    try {
      session?.abortCompaction()
    }
    catch {}
    await session?.abort().catch(() => {})
    await execution.completion.catch(() => {})
    return true
  }

  cancelAndWaitForConversation(conversationId: string): Promise<number> {
    return this.#cancelAndWait(execution => execution.identity.conversationId === conversationId)
  }

  cancelAndWaitForRoot(canonicalRoot: string): Promise<number> {
    return this.#cancelAndWait(execution => execution.identity.canonicalRoot === canonicalRoot)
  }

  async recoverInterruptedRuns(): Promise<number> {
    await this.#cancelPendingApprovals?.()
    const interrupted = this.#runs.listIncomplete()
    for (const run of interrupted) {
      if (await this.#recoverInterruptedCompaction(run))
        continue
      let completedAt = this.#timestamp()
      try {
        const events = await this.#eventLog.read(run.id)
        const recoveredMessages = createInterruptedMessageEvents(events)
          .filter(snapshot => !this.#conversations.findMessageById(snapshot.messageId))
          .map(snapshot => ({
            createdAt: this.#timestamp(),
            payload: {
              content: createBuddyInterruptedMessageContent(
                snapshot.text,
                snapshot.truncated,
              ),
              messageId: snapshot.messageId,
              reason: 'runtime_restarted',
              role: 'assistant',
            },
            runId: run.id,
            type: 'message.interrupted',
          }))
        completedAt = this.#timestamp()
        await this.#eventLog.appendBatch([
          ...recoveredMessages,
          {
            createdAt: completedAt,
            payload: { errorCode: 'RUNTIME_RESTARTED' },
            runId: run.id,
            type: 'run.failed',
          },
        ])
      }
      catch (error) {
        if (error instanceof RunEventLogFatalError)
          throw error
      }
      this.#runs.updateStatus(run.id, 'failed', completedAt, 'RUNTIME_RESTARTED')
    }
    return interrupted.length
  }

  async #recoverInterruptedCompaction(run: RunRecord): Promise<boolean> {
    if (run.purpose !== 'conversation.compaction')
      return false

    try {
      const events = await this.#eventLog.read(run.id)
      const completionRecorded = events.some(
        event => event.type === 'context.compaction.completed',
      )
      let evidence: CommittedPiCompactionEvidence | null = null
      if (run.piSessionFile && this.#inspectCommittedCompaction) {
        try {
          evidence = await this.#inspectCommittedCompaction(run)
        }
        catch (error) {
          const errorCode = readStableRunErrorCode(error)
          if (!completionRecorded && errorCode === 'SESSION_STORAGE_UNAVAILABLE') {
            await this.#closeRun(run.id, 'failed', errorCode)
            return true
          }
        }
      }
      if (!completionRecorded && !evidence)
        return false

      if (!completionRecorded && evidence) {
        await this.#eventLog.append({
          payload: {
            estimatedTokensAfter: evidence.estimatedTokensAfter,
            reason: 'manual',
            tokensBefore: evidence.tokensBefore,
            willRetry: false,
          },
          runId: run.id,
          type: 'context.compaction.completed',
        })
      }
      if (evidence?.usage) {
        try {
          await this.#usage.record({
            createdAt: this.#timestamp(),
            model: run.model,
            provider: run.provider,
            purpose: 'compaction',
            runId: run.id,
            sourceEntryId: `compaction:${evidence.firstKeptEntryId}`,
            usage: evidence.usage,
          })
        }
        catch (error) {
          if (error instanceof RunEventLogFatalError)
            throw error
        }
      }
      await this.#closeRun(run.id, 'completed', null)
      return true
    }
    catch (error) {
      if (error instanceof RunEventLogFatalError)
        throw error
      return false
    }
  }

  async dispose(): Promise<void> {
    for (const execution of this.#executions.values())
      execution.controller.abort()
    for (const session of this.#activeSessions.values()) {
      try {
        session.abortCompaction()
      }
      catch {}
    }
    await Promise.allSettled([...this.#activeSessions.values()].map(session => session.abort()))
    await Promise.allSettled([...this.#executions.values()].map(execution => execution.completion))
    await this.#sessions.dispose()
    this.#activeSessions.clear()
    this.#controllers.clear()
    this.#executions.clear()
  }

  async #cancelAndWait(predicate: (execution: ActiveRunExecution) => boolean): Promise<number> {
    const executions = [...this.#executions.values()].filter(predicate)
    for (const execution of executions)
      execution.controller.abort()
    await Promise.allSettled(executions.map(async (execution) => {
      const session = this.#activeSessions.get(execution.runId)
      try {
        session?.abortCompaction()
      }
      catch {}
      await session?.abort().catch(() => {})
      await execution.completion
    }))
    return executions.length
  }

  async #executeTurn(execution: TurnExecution): Promise<RunRecord> {
    const { controller, identity, input, runId } = execution
    controller.signal.throwIfAborted()
    this.#runs.updateStatus(runId, 'running')
    await this.#eventLog.append({
      payload: createRunStartedPayload(input),
      runId,
      type: 'run.started',
    })
    const current = this.#runs.findById(runId)
    if (!current)
      throw new BuddyAgentRunError('RUN_NOT_FOUND')
    const binding = await this.#sessions.getOrCreate(identity, () => this.#sessionFactory({
      ...identity,
      piSessionFile: current.piSessionFile,
      resources: input.resources,
      runId,
      signal: controller.signal,
      thinkingLevel: input.thinkingLevel,
    }))
    controller.signal.throwIfAborted()
    if (!this.#runs.bindSession(runId, binding.piSessionFile))
      throw new BuddyAgentRunError('RUN_NOT_FOUND')
    await this.#recordSessionRecovery(runId, binding)

    this.#activeSessions.set(runId, binding.session)
    const releaseTurn = await binding.session.activateTurn({
      contextWindow: current.contextWindow,
      maxTokens: current.maxTokens,
      model: input.model,
      provider: input.provider,
      runId,
      serviceTier: input.serviceTier ?? null,
      signal: controller.signal,
      thinkingLevel: input.thinkingLevel,
    })
    const projectionState = createPiEventProjectionState({
      canonicalRoot: input.canonicalRoot,
    })
    const eventWriter = new BufferedRunEventWriter(
      this.#eventLog,
      runId,
      () => this.#timestamp(),
    )
    let failureCode: string | undefined
    let failureMessage: string | undefined
    let finalAssistantAnswerProjected = false
    let eventTail = Promise.resolve()
    const unsubscribe = binding.session.subscribe((event) => {
      eventTail = eventTail.then(async () => {
        const projected = projectPiEvent(event, projectionState)
        if (projected.failureCode) {
          failureCode = projected.failureCode
          failureMessage = projected.failureMessage
        }
        if (event.type === 'message_end' && event.message.role === 'assistant') {
          finalAssistantAnswerProjected = event.message.stopReason === 'stop'
            && projected.events.some(candidate => candidate.type === 'message.completed')
        }
        for (const projectedEvent of projected.events)
          eventWriter.append(projectedEvent)
        if (projected.artifact)
          await this.#recordArtifact(runId, input, projected.artifact)
        if (event.type === 'message_end' && projected.sourceMessageId) {
          const message = event.message
          const purpose = message.role === 'assistant'
            ? 'turn'
            : message.role === 'toolResult' && message.usage
              ? 'tool'
              : null
          if (purpose) {
            const sourceMessageId = projected.sourceMessageId
            await eventWriter.drain()
            const usageRecord = await this.#recordUsageWithDegradation(purpose, runId, () => (
              this.#usage.recordMessage({
                createdAt: this.#timestamp(),
                fallbackModel: input.model,
                fallbackProvider: input.provider,
                message,
                runId,
                sourceMessageId,
              })
            ))
            if (purpose === 'turn' && usageRecord) {
              const totalTokens = usageRecord.totalTokens
                || usageRecord.inputTokens
                + usageRecord.outputTokens
                + usageRecord.cacheReadTokens
                + usageRecord.cacheWriteTokens
              const breakdown = await binding.session.getContextUsageBreakdown?.(totalTokens)
              if (breakdown) {
                await this.#eventLog.append({
                  payload: {
                    ...breakdown,
                    model: usageRecord.model,
                    provider: usageRecord.provider,
                    totalTokens,
                  },
                  runId,
                  type: 'context.usage.updated',
                })
              }
            }
          }
        }
        if (event.type === 'compaction_end' && event.result?.usage) {
          const result = event.result
          await eventWriter.drain()
          await this.#recordUsageWithDegradation('compaction', runId, () => (
            this.#recordCompactionResultUsage(result, {
              model: input.model,
              provider: input.provider,
              runId,
            })
          ))
        }
      })
    })

    try {
      await binding.session.prompt(input.prompt, {
        expandPromptTemplates: false,
        images: input.images,
        source: 'rpc',
      })
      await binding.session.waitForIdle()
      await eventTail
      await eventWriter.drain()
    }
    catch (error) {
      const tailError = await settledError(eventTail)
      const writerError = await settledError(eventWriter.drain())
      const fatalError = [error, tailError, writerError]
        .find(candidate => candidate instanceof RunEventLogFatalError)
      if (fatalError)
        throw fatalError
      if (
        readStableRunErrorCode(error) === 'SESSION_STORAGE_UNAVAILABLE'
        && !controller.signal.aborted
        && !failureCode
        && finalAssistantAnswerProjected
        && tailError === null
        && writerError === null
      ) {
        await this.#eventLog.append({
          payload: {
            errorCode: 'SESSION_STORAGE_UNAVAILABLE',
            source: 'pi_session',
          },
          runId,
          type: 'session.continuity.degraded',
        })
        await this.#invalidateSessionContinuity(identity, runId)
        return this.#closeRun(runId, 'completed', null)
      }
      throw error
    }
    finally {
      unsubscribe()
      releaseTurn()
    }

    if (controller.signal.aborted || failureCode === 'MODEL_REQUEST_ABORTED')
      return this.#closeRun(runId, 'cancelled', 'RUN_CANCELLED')
    if (failureCode)
      return this.#closeRun(runId, 'failed', failureCode, failureMessage)
    return this.#closeRun(runId, 'completed', null)
  }

  async #executeCompaction(
    input: StartBuddyCompactionInput,
    identity: BuddySessionIdentity,
    controller: AbortController,
    run: RunRecord,
  ): Promise<RunRecord> {
    controller.signal.throwIfAborted()
    this.#runs.updateStatus(run.id, 'running')
    await this.#eventLog.append({
      payload: createRunStartedPayload(input),
      runId: run.id,
      type: 'run.started',
    })
    const binding = await this.#sessions.getOrCreate(identity, () => this.#sessionFactory({
      ...identity,
      piSessionFile: run.piSessionFile,
      resources: input.resources,
      runId: run.id,
      signal: controller.signal,
      thinkingLevel: input.thinkingLevel,
    }))
    controller.signal.throwIfAborted()
    if (!this.#runs.bindSession(run.id, binding.piSessionFile))
      throw new BuddyAgentRunError('RUN_NOT_FOUND')
    await this.#recordSessionRecovery(run.id, binding)

    if (!binding.session.canCompact())
      throw new BuddyAgentRunError('CONTEXT_COMPACTION_NOT_NEEDED')

    this.#activeSessions.set(run.id, binding.session)
    const releaseTurn = await binding.session.activateTurn({
      contextWindow: run.contextWindow,
      maxTokens: run.maxTokens,
      model: run.model,
      provider: run.provider,
      runId: run.id,
      serviceTier: null,
      signal: controller.signal,
      thinkingLevel: input.thinkingLevel,
    })
    const projectionState = createPiEventProjectionState({
      canonicalRoot: input.canonicalRoot,
    })
    const eventWriter = new BufferedRunEventWriter(
      this.#eventLog,
      run.id,
      () => this.#timestamp(),
    )
    let eventTail = Promise.resolve()
    const unsubscribe = binding.session.subscribe((event) => {
      eventTail = eventTail.then(() => {
        const projected = projectPiEvent(event, projectionState)
        for (const projectedEvent of projected.events)
          eventWriter.append(projectedEvent)
      })
    })

    try {
      const result = await binding.session.compact(
        input.customInstructions?.trim() || undefined,
      )
      await eventTail
      await eventWriter.drain()
      await this.#recordUsageWithDegradation('compaction', run.id, () => (
        this.#recordCompactionResultUsage(result, run)
      ))
    }
    catch (error) {
      const tailError = await settledError(eventTail)
      const writerError = await settledError(eventWriter.drain())
      const fatalError = [error, tailError, writerError]
        .find(candidate => candidate instanceof RunEventLogFatalError)
      if (fatalError)
        throw fatalError
      if (controller.signal.aborted || isAbortError(error))
        throw error
      if (readStableRunErrorCode(error) === 'SESSION_STORAGE_UNAVAILABLE')
        throw error
      throw new BuddyAgentRunError('COMPACTION_FAILED')
    }
    finally {
      unsubscribe()
      releaseTurn()
    }

    if (controller.signal.aborted)
      return this.#closeRun(run.id, 'cancelled', 'RUN_CANCELLED')
    return this.#closeRun(run.id, 'completed', null)
  }

  async #recordSessionRecovery(
    runId: string,
    binding: BuddySessionBinding<BuddyAgentSessionLike>,
  ): Promise<void> {
    if (!binding.recoveredFromProductHistory)
      return
    const degradation = binding.recoveryDegradation
    await this.#eventLog.appendBatch([
      {
        payload: { source: 'sqlite' },
        runId,
        type: 'session.recovered',
      },
      ...(degradation
        ? [{
            payload: {
              missingAttachmentCount: degradation.missingAttachmentIds.length,
              missingAttachmentIds: degradation.missingAttachmentIds,
              recoveredImageCount: degradation.recoveredImageCount,
              source: 'sqlite',
            },
            runId,
            type: 'session.recovery.degraded',
          }]
        : []),
    ])
    binding.recoveredFromProductHistory = false
    binding.recoveryDegradation = undefined
  }

  async #recordUsageWithDegradation<TResult>(
    purpose: BuddyUsagePurpose,
    runId: string,
    record: () => Promise<TResult>,
  ): Promise<TResult | null> {
    try {
      return await record()
    }
    catch (error) {
      if (error instanceof RunEventLogFatalError)
        throw error
      const degradationError = await settledError(this.#eventLog.append({
        payload: {
          errorCode: 'USAGE_RECORDING_FAILED',
          purpose,
        },
        runId,
        type: 'usage.recording.degraded',
      }))
      if (degradationError instanceof RunEventLogFatalError)
        throw degradationError
      return null
    }
  }

  #recordCompactionResultUsage(
    result: CompactionResult,
    run: Pick<RunRecord, 'id' | 'model' | 'provider'> | {
      model: string
      provider: string
      runId: string
    },
  ): ReturnType<UsageService['record']> {
    if (!result.usage)
      return Promise.resolve(null)
    const runId = 'runId' in run ? run.runId : run.id
    return this.#usage.record({
      createdAt: this.#timestamp(),
      model: run.model,
      provider: run.provider,
      purpose: 'compaction',
      runId,
      sourceEntryId: `compaction:${result.firstKeptEntryId}`,
      usage: result.usage,
    })
  }

  async #recordArtifact(
    runId: string,
    input: StartBuddyTurnInput,
    artifact: ProjectedArtifact,
  ): Promise<void> {
    const requestedPath = isAbsolute(artifact.requestedPath)
      ? artifact.requestedPath
      : resolve(input.cwd, artifact.requestedPath)
    const resolution = await resolveGrantedPath([{
      canonicalRoot: input.canonicalRoot,
      projectId: input.projectId ?? 'conversation',
      root: input.canonicalRoot,
    }], requestedPath, 'existing')
    const record = {
      canonicalPath: resolution.canonicalPath,
      createdAt: this.#timestamp(),
      id: randomUUID(),
      mimeType: null,
      operation: artifact.operation,
      projectId: input.projectId,
      runId,
    }
    await this.#eventLog.append({
      payload: record,
      runId,
      type: 'artifact.changed',
    })
  }

  async #closeFromError(
    runId: string,
    signal: AbortSignal,
    error: unknown,
  ): Promise<RunRecord> {
    if (error instanceof RunEventLogFatalError) {
      const run = this.#runs.findById(runId)
      if (!run)
        throw new BuddyAgentRunError('RUN_NOT_FOUND')
      return run
    }
    if (signal.aborted || isAbortError(error))
      return this.#closeRun(runId, 'cancelled', 'RUN_CANCELLED')
    return this.#closeRun(runId, 'failed', readStableRunErrorCode(error))
  }

  async #closeExecutionFromError(
    identity: BuddySessionIdentity,
    runId: string,
    signal: AbortSignal,
    error: unknown,
  ): Promise<RunRecord> {
    if (readStableRunErrorCode(error) === 'SESSION_STORAGE_UNAVAILABLE')
      await this.#invalidateSessionContinuity(identity, runId)
    return this.#closeFromError(runId, signal, error)
  }

  async #invalidateSessionContinuity(
    identity: BuddySessionIdentity,
    runId: string,
  ): Promise<void> {
    const run = this.#runs.findById(runId)
    if (run?.piSessionFile) {
      this.#runs.clearSessionBindings(
        run.conversationId,
        run.branchId,
        run.piSessionFile,
      )
    }
    await this.#sessions.invalidateSession(identity)
  }

  async #closeRun(
    runId: string,
    status: Extract<RunStatus, 'cancelled' | 'completed' | 'failed'>,
    errorCode: string | null,
    errorMessage?: string,
  ): Promise<RunRecord> {
    const type = `run.${status}` as const
    const completedAt = this.#timestamp()
    let terminalEventPersisted = true
    try {
      await this.#eventLog.append({
        createdAt: completedAt,
        payload: {
          ...(errorCode ? { errorCode } : {}),
          ...(errorMessage ? { errorMessage } : {}),
        },
        runId,
        type,
      })
    }
    catch (error) {
      if (error instanceof RunEventLogFatalError)
        throw error
      terminalEventPersisted = false
      status = 'failed'
      errorCode = 'EVENT_LOG_FAILED'
    }
    this.#runs.updateStatus(runId, status, completedAt, errorCode)
    const run = this.#runs.findById(runId)
    if (!run)
      throw new BuddyAgentRunError('RUN_NOT_FOUND')
    if (terminalEventPersisted) {
      try {
        await this.#eventLog.compactTerminalRun(runId)
      }
      catch (error) {
        if (error instanceof RunEventLogFatalError)
          throw error
      }
    }
    return run
  }

  #timestamp(): string {
    this.#lastTimestamp = Math.max(Date.now(), this.#lastTimestamp + 1)
    return new Date(this.#lastTimestamp).toISOString()
  }
}

async function settledError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
    return null
  }
  catch (error) {
    return error
  }
}

class BufferedRunEventWriter {
  readonly #eventLog: RunEventLog
  readonly #runId: string
  readonly #timestamp: () => string
  #pending: TimestampedBuddyProjectedEvent[] = []
  #tail = Promise.resolve()
  #timer: NodeJS.Timeout | undefined

  constructor(eventLog: RunEventLog, runId: string, timestamp: () => string) {
    this.#eventLog = eventLog
    this.#runId = runId
    this.#timestamp = timestamp
  }

  append(event: BuddyProjectedEvent): void {
    const timestamped = { ...event, createdAt: this.#timestamp() }
    if (timestamped.type !== 'message.delta' && timestamped.type !== 'message.block.delta') {
      this.#flushPending()
      this.#enqueue([timestamped])
      return
    }

    const previous = this.#pending.at(-1)
    const merged = previous ? mergeStreamDelta(previous, timestamped) : null
    if (merged)
      this.#pending[this.#pending.length - 1] = merged
    else
      this.#pending.push(timestamped)
    if (!this.#timer) {
      this.#timer = setTimeout(() => this.#flushPending(), 25)
      this.#timer.unref()
    }
  }

  async drain(): Promise<void> {
    this.#flushPending()
    await this.#tail
  }

  #enqueue(events: readonly TimestampedBuddyProjectedEvent[]): void {
    const write = this.#eventLog.appendBatch(events.map(event => ({
      createdAt: event.createdAt,
      payload: event.payload,
      runId: this.#runId,
      type: event.type,
    })))
    this.#tail = Promise.all([this.#tail, write]).then(() => undefined)
    void this.#tail.catch(() => {})
  }

  #flushPending(): void {
    if (this.#timer) {
      clearTimeout(this.#timer)
      this.#timer = undefined
    }
    if (this.#pending.length === 0)
      return
    const events = this.#pending
    this.#pending = []
    this.#enqueue(events)
  }
}

interface TimestampedBuddyProjectedEvent extends BuddyProjectedEvent {
  createdAt: string
}

function mergeStreamDelta(
  left: TimestampedBuddyProjectedEvent,
  right: TimestampedBuddyProjectedEvent,
): TimestampedBuddyProjectedEvent | null {
  if (left.type === 'message.block.delta' && right.type === 'message.block.delta')
    return mergeMessageBlockDelta(left, right)
  if (left.type !== 'message.delta' || right.type !== 'message.delta')
    return null
  const leftPayload = readMessageDeltaPayload(left.payload)
  const rightPayload = readMessageDeltaPayload(right.payload)
  if (
    !leftPayload
    || !rightPayload
    || leftPayload.messageId !== rightPayload.messageId
    || leftPayload.delta.length + rightPayload.delta.length > 64 * 1024
  ) {
    return null
  }
  return {
    createdAt: left.createdAt,
    payload: {
      delta: leftPayload.delta + rightPayload.delta,
      messageId: leftPayload.messageId,
    },
    type: 'message.delta',
  }
}

function mergeMessageBlockDelta(
  left: TimestampedBuddyProjectedEvent,
  right: TimestampedBuddyProjectedEvent,
): TimestampedBuddyProjectedEvent | null {
  const leftPayload = readMessageBlockDeltaPayload(left.payload)
  const rightPayload = readMessageBlockDeltaPayload(right.payload)
  if (
    !leftPayload
    || !rightPayload
    || leftPayload.messageId !== rightPayload.messageId
    || leftPayload.contentIndex !== rightPayload.contentIndex
    || leftPayload.reasoningKind !== rightPayload.reasoningKind
    || leftPayload.delta.length + rightPayload.delta.length > 64 * 1024
  ) {
    return null
  }
  return {
    createdAt: left.createdAt,
    payload: {
      contentIndex: leftPayload.contentIndex,
      delta: leftPayload.delta + rightPayload.delta,
      kind: 'reasoning',
      messageId: leftPayload.messageId,
      reasoningKind: leftPayload.reasoningKind,
    },
    type: 'message.block.delta',
  }
}

function readMessageDeltaPayload(value: unknown): { delta: string, messageId: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return null
  const payload = value as Record<string, unknown>
  return typeof payload.delta === 'string' && typeof payload.messageId === 'string'
    ? { delta: payload.delta, messageId: payload.messageId }
    : null
}

function readMessageBlockDeltaPayload(
  value: unknown,
): { contentIndex: number, delta: string, messageId: string, reasoningKind: 'summary' | 'thinking' } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return null
  const payload = value as Record<string, unknown>
  const reasoningKind = buddyReasoningKindSchema.safeParse(payload.reasoningKind)
  return payload.kind === 'reasoning'
    && typeof payload.delta === 'string'
    && typeof payload.messageId === 'string'
    && reasoningKind.success
    && typeof payload.contentIndex === 'number'
    && Number.isSafeInteger(payload.contentIndex)
    && payload.contentIndex >= 0
    ? {
        contentIndex: payload.contentIndex,
        delta: payload.delta,
        messageId: payload.messageId,
        reasoningKind: reasoningKind.data,
      }
    : null
}

function createRunStartedPayload(
  input: StartBuddyTurnInput | StartBuddyCompactionInput,
): Record<string, unknown> {
  if (!input.projectId)
    return {}

  return {
    projectSnapshot: {
      canonicalRoot: input.canonicalRoot,
      instructionsHash: createHash('sha256')
        .update(input.resources.projectInstructions)
        .digest('hex'),
      memoryScope: input.memoryScope ?? 'personal_and_project',
      projectId: input.projectId,
      resourceRevision: input.resources.revision,
    },
  }
}

export class BuddyAgentRunError extends Error {
  readonly code: string

  constructor(code: string) {
    super('Lexora Buddy could not complete the requested run')
    this.name = 'BuddyAgentRunError'
    this.code = code
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function readStableRunErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error))
    return 'AGENT_RUN_FAILED'
  const code = (error as { code?: unknown }).code
  if (typeof code !== 'string')
    return 'AGENT_RUN_FAILED'
  if (new Set([
    'BUDDY_EXTENSION_LOAD_FAILED',
    'COMPACTION_FAILED',
    'CONTEXT_COMPACTION_NOT_NEEDED',
    'DIRECTORY_NOT_AUTHORIZED',
    'PATH_OUTSIDE_GRANTED_DIRECTORY',
    'PROVIDER_UNAVAILABLE',
    'AUTHENTICATION_REQUIRED',
    'SESSION_BINDING_INVALID',
    'SESSION_BINDING_MISMATCH',
    'SESSION_STORAGE_UNAVAILABLE',
    'UNTRUSTED_EXTENSION_LOADED',
  ]).has(code)) {
    return code
  }
  return 'AGENT_RUN_FAILED'
}
