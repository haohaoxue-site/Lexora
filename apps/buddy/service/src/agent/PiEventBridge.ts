import type { AgentSessionEvent, CompactionResult } from '@earendil-works/pi-coding-agent'
import type { RunEventWriter } from '../events/RunEventPorts'
import type { BuddyUsagePurpose } from '../usage/recordPiUsage'
import type { UsageService } from '../usage/UsageService'
import type { BuddyContextUsageBreakdown } from './contextUsageBreakdown'
import { RunEventLogFatalError } from '../events/RunEventFailure'
import { BufferedRunEventWriter } from './BufferedRunEventWriter'
import {
  createPiEventProjectionState,
  projectPiEvent,
  projectToolExecutionAuthorized,
} from './projectPiEvent'

type PiEventLog = RunEventWriter
type PiUsageService = Pick<UsageService, 'record' | 'recordMessage'>

export interface PiEventBridgeSession {
  getContextUsageBreakdown?: (
    totalTokens: number,
  ) => BuddyContextUsageBreakdown | null | Promise<BuddyContextUsageBreakdown | null>
  subscribe: (listener: (event: AgentSessionEvent) => void) => () => void
}

export interface CreatePiEventChannelInput {
  canonicalRoot: string
  model: string
  provider: string
  runId: string
  session: PiEventBridgeSession
  timestamp: () => string
}

export interface PiToolExecutionAuthorizedEvent {
  arguments: unknown
  toolCallId: string
  toolName: string
}

export interface PiEventBridgeSettlement {
  eventError: unknown | null
  writerError: unknown | null
}

export interface PiTurnEventOutcome {
  failureCode: string | undefined
  failureMessage: string | undefined
  finalAssistantAnswerProjected: boolean
}

interface PiEventChannel {
  flush: () => Promise<void>
  settle: () => Promise<PiEventBridgeSettlement>
  subscribe: () => () => void
}

export interface PiTurnEventChannel extends PiEventChannel {
  readonly outcome: PiTurnEventOutcome
  projectToolExecutionAuthorized: (
    event: PiToolExecutionAuthorizedEvent,
  ) => Promise<void>
}

export interface PiCompactionEventChannel extends PiEventChannel {
  recordCompactionResult: (result: CompactionResult) => Promise<void>
}

export interface PiEventBridgeOptions {
  eventLog: PiEventLog
  usage: PiUsageService
}

export class PiEventBridge {
  readonly #eventLog: PiEventLog
  readonly #usage: PiUsageService

  constructor(options: PiEventBridgeOptions) {
    this.#eventLog = options.eventLog
    this.#usage = options.usage
  }

  createTurn(input: CreatePiEventChannelInput): PiTurnEventChannel {
    return new ActivePiEventChannel({
      ...input,
      eventLog: this.#eventLog,
      recordEventUsage: true,
      usage: this.#usage,
    })
  }

  createCompaction(input: CreatePiEventChannelInput): PiCompactionEventChannel {
    return new ActivePiEventChannel({
      ...input,
      eventLog: this.#eventLog,
      recordEventUsage: false,
      usage: this.#usage,
    })
  }
}

interface ActivePiEventChannelOptions extends CreatePiEventChannelInput {
  eventLog: PiEventLog
  recordEventUsage: boolean
  usage: PiUsageService
}

class ActivePiEventChannel implements PiCompactionEventChannel, PiTurnEventChannel {
  readonly #eventLog: PiEventLog
  readonly #eventWriter: BufferedRunEventWriter
  readonly #model: string
  readonly #projectionState: ReturnType<typeof createPiEventProjectionState>
  readonly #provider: string
  readonly #recordEventUsage: boolean
  readonly #runId: string
  readonly #session: PiEventBridgeSession
  readonly #timestamp: () => string
  readonly #usage: PiUsageService
  #eventTail = Promise.resolve()
  #failureCode: string | undefined
  #failureMessage: string | undefined
  #finalAssistantAnswerProjected = false

  constructor(options: ActivePiEventChannelOptions) {
    this.#eventLog = options.eventLog
    this.#eventWriter = new BufferedRunEventWriter(
      options.eventLog,
      options.runId,
      options.timestamp,
    )
    this.#model = options.model
    this.#projectionState = createPiEventProjectionState({
      canonicalRoot: options.canonicalRoot,
    })
    this.#provider = options.provider
    this.#recordEventUsage = options.recordEventUsage
    this.#runId = options.runId
    this.#session = options.session
    this.#timestamp = options.timestamp
    this.#usage = options.usage
  }

  get outcome(): PiTurnEventOutcome {
    return {
      failureCode: this.#failureCode,
      failureMessage: this.#failureMessage,
      finalAssistantAnswerProjected: this.#finalAssistantAnswerProjected,
    }
  }

  async flush(): Promise<void> {
    await this.#eventTail
    await this.#eventWriter.drain()
  }

  async projectToolExecutionAuthorized(
    event: PiToolExecutionAuthorizedEvent,
  ): Promise<void> {
    await this.flush()
    const projected = projectToolExecutionAuthorized(event, this.#projectionState)
    this.#eventWriter.appendBatch(projected.events)
    await this.#eventWriter.drain()
  }

  async recordCompactionResult(result: CompactionResult): Promise<void> {
    await this.#recordUsageWithDegradation('compaction', () => (
      this.#recordCompactionResultUsage(result)
    ))
  }

  async settle(): Promise<PiEventBridgeSettlement> {
    const eventError = await settledError(this.#eventTail)
    const writerError = await settledError(this.#eventWriter.drain())
    return { eventError, writerError }
  }

  subscribe(): () => void {
    return this.#session.subscribe((event) => {
      this.#eventTail = this.#eventTail.then(() => this.#handleEvent(event))
    })
  }

  async #handleEvent(event: AgentSessionEvent): Promise<void> {
    const projected = projectPiEvent(event, this.#projectionState)
    if (projected.failureCode) {
      this.#failureCode = projected.failureCode
      this.#failureMessage = projected.failureMessage
    }
    if (event.type === 'auto_retry_end' && event.success) {
      this.#failureCode = undefined
      this.#failureMessage = undefined
    }
    if (event.type === 'message_end' && event.message.role === 'assistant') {
      this.#finalAssistantAnswerProjected = event.message.stopReason === 'stop'
        && projected.events.some(candidate => candidate.type === 'message.completed')
    }
    this.#eventWriter.appendBatch(projected.events)
    if (this.#recordEventUsage)
      await this.#recordUsageFromEvent(event, projected.sourceMessageId)
  }

  async #recordUsageFromEvent(
    event: AgentSessionEvent,
    sourceMessageId: string | undefined,
  ): Promise<void> {
    if (event.type === 'message_end' && sourceMessageId) {
      const message = event.message
      const purpose = message.role === 'assistant'
        ? 'turn'
        : message.role === 'toolResult' && message.usage
          ? 'tool'
          : null
      if (purpose) {
        await this.#eventWriter.drain()
        const usageRecord = await this.#recordUsageWithDegradation(purpose, () => (
          this.#usage.recordMessage({
            createdAt: this.#timestamp(),
            fallbackModel: this.#model,
            fallbackProvider: this.#provider,
            message,
            runId: this.#runId,
            sourceMessageId,
          })
        ))
        if (purpose === 'turn' && usageRecord) {
          const contextTokens = usageRecord.inputTokens
            + usageRecord.cacheReadTokens
            + usageRecord.cacheWriteTokens
            || Math.max(0, usageRecord.totalTokens - usageRecord.outputTokens)
          const breakdown = await this.#session.getContextUsageBreakdown?.(contextTokens)
          if (breakdown) {
            await this.#eventLog.append({
              payload: {
                ...breakdown,
                model: usageRecord.model,
                provider: usageRecord.provider,
                totalTokens: contextTokens,
              },
              runId: this.#runId,
              type: 'context.usage.updated',
            })
          }
        }
      }
    }
    if (event.type === 'compaction_end') {
      const result = event.result
      if (result?.usage) {
        await this.#eventWriter.drain()
        await this.#recordUsageWithDegradation('compaction', () => (
          this.#recordCompactionResultUsage(result)
        ))
      }
    }
  }

  async #recordUsageWithDegradation<TResult>(
    purpose: BuddyUsagePurpose,
    record: () => Promise<TResult>,
  ): Promise<TResult | null> {
    try {
      return await record()
    }
    catch (error) {
      if (error instanceof RunEventLogFatalError)
        throw error
      await this.#eventLog.append({
        payload: {
          errorCode: 'USAGE_RECORDING_FAILED',
          purpose,
        },
        runId: this.#runId,
        type: 'usage.recording.degraded',
      })
      return null
    }
  }

  #recordCompactionResultUsage(
    result: CompactionResult,
  ): ReturnType<UsageService['record']> {
    if (!result.usage)
      return Promise.resolve(null)
    return this.#usage.record({
      createdAt: this.#timestamp(),
      model: this.#model,
      provider: this.#provider,
      purpose: 'compaction',
      runId: this.#runId,
      sourceEntryId: `compaction:${result.firstKeptEntryId}`,
      usage: result.usage,
    })
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
