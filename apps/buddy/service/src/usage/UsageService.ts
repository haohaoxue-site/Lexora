import type { Usage } from '@earendil-works/pi-ai'
import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent'
import type { RunEventWriter } from '../events/RunEventPorts'
import type { UsageRecord, UsageRepository } from '../storage/usageRepository'
import type { BuddyUsagePurpose } from './recordPiUsage'
import { randomUUID } from 'node:crypto'

import { recordPiUsage } from './recordPiUsage'

export interface UsageServiceOptions {
  eventLog: Pick<RunEventWriter, 'append'>
  repository: UsageRepository
}

export interface RecordBuddyUsageInput {
  createdAt: string
  model: string
  provider: string
  purpose: BuddyUsagePurpose
  runId: string
  sourceEntryId: string
  usage: Usage
}

export interface RecordPiMessageUsageInput {
  createdAt: string
  fallbackModel: string
  fallbackProvider: string
  message: Extract<AgentSessionEvent, { type: 'message_end' }>['message']
  runId: string
  sourceMessageId: string
}

export class UsageService {
  readonly #eventLog: Pick<RunEventWriter, 'append'>
  readonly #repository: UsageRepository

  constructor(options: UsageServiceOptions) {
    this.#eventLog = options.eventLog
    this.#repository = options.repository
  }

  async record(input: RecordBuddyUsageInput): Promise<UsageRecord | null> {
    if (this.#repository.findBySource(input.runId, input.sourceEntryId, input.purpose))
      return null
    const record = recordPiUsage({
      ...input,
      id: randomUUID(),
    })
    await this.#eventLog.append({
      createdAt: record.createdAt,
      payload: durableUsagePayload(record),
      runId: record.runId,
      type: 'usage.recorded',
    })
    return record
  }

  recordMessage(input: RecordPiMessageUsageInput): Promise<UsageRecord | null> {
    const usage = readMessageUsage(input.message)
    if (!usage)
      return Promise.resolve(null)
    return this.record({
      createdAt: input.createdAt,
      model: usage.model ?? input.fallbackModel,
      provider: usage.provider ?? input.fallbackProvider,
      purpose: usage.purpose,
      runId: input.runId,
      sourceEntryId: input.sourceMessageId,
      usage: usage.usage,
    })
  }
}

interface EntryUsage {
  model?: string
  provider?: string
  purpose: BuddyUsagePurpose
  usage: Usage
}

function readMessageUsage(
  message: Extract<AgentSessionEvent, { type: 'message_end' }>['message'],
): EntryUsage | null {
  if (message.role === 'assistant') {
    return {
      model: message.model,
      provider: message.provider,
      purpose: 'turn',
      usage: message.usage,
    }
  }
  if (message.role === 'toolResult' && message.usage)
    return { purpose: 'tool', usage: message.usage }
  return null
}

function durableUsagePayload(record: UsageRecord): unknown {
  return {
    cacheReadCost: record.cacheReadCost,
    cacheReadTokens: record.cacheReadTokens,
    cacheWriteCost: record.cacheWriteCost,
    cacheWriteTokens: record.cacheWriteTokens,
    inputCost: record.inputCost,
    inputTokens: record.inputTokens,
    model: record.model,
    outputCost: record.outputCost,
    outputTokens: record.outputTokens,
    provider: record.provider,
    purpose: record.purpose,
    reasoningTokens: record.reasoningTokens,
    sourceEntryId: record.sourceEntryId,
    totalCost: record.totalCost,
    totalTokens: record.totalTokens,
    usageRecordId: record.id,
  }
}
