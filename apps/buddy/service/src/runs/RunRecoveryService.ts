import type { CommittedPiCompactionEvidence } from '../agent/inspectCommittedPiCompaction'
import type { AppendBuddyRunEventInput } from '../events/BuddyRunEvent'
import type { RunEventReader, RunEventWriter } from '../events/RunEventPorts'
import type { ConversationHistoryRepository } from '../storage/conversationHistoryRepository'
import type { RunRecord } from '../storage/runRecord'
import type { RunRepository } from '../storage/runRepository'
import type { UsageService } from '../usage/UsageService'
import type { RunLifecycleService } from './RunLifecycleService'
import { createBuddyInterruptedMessageContent } from '../../../shared/buddyMessageContent'
import { createInterruptedMessageEvents } from '../events/createInterruptedMessageEvents'
import { RunEventLogFatalError } from '../events/RunEventFailure'
import { readStableRunErrorCode } from './runError'

export interface RunRecoveryServiceOptions {
  cancelPendingApprovals?: () => Promise<number>
  captureInterruptedChanges?: (runId: string) => Promise<void>
  conversations: Pick<ConversationHistoryRepository, 'findMessageById'>
  eventLog: Pick<RunEventReader, 'read'> & Pick<RunEventWriter, 'append'>
  inspectCommittedCompaction?: (
    run: RunRecord,
  ) => Promise<CommittedPiCompactionEvidence | null>
  lifecycle: Pick<RunLifecycleService, 'finalize'>
  repository: Pick<RunRepository, 'listIncomplete'>
  usage: Pick<UsageService, 'record'>
}

export class RunRecoveryService {
  readonly #options: RunRecoveryServiceOptions
  #lastTimestamp = 0

  constructor(options: RunRecoveryServiceOptions) {
    this.#options = options
  }

  async recoverInterruptedRuns(): Promise<number> {
    await this.#options.cancelPendingApprovals?.()
    const interrupted = this.#options.repository.listIncomplete()
    for (const run of interrupted) {
      await this.#options.captureInterruptedChanges?.(run.id)
      if (await this.#recoverInterruptedCompaction(run))
        continue
      const events = await this.#options.eventLog.read(run.id)
      const recoveredMessages: AppendBuddyRunEventInput[] = createInterruptedMessageEvents(events)
        .filter(snapshot => !this.#options.conversations.findMessageById(snapshot.messageId))
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
          type: 'message.interrupted' as const,
        }))
      await this.#options.lifecycle.finalize({
        completedAt: this.#timestamp(),
        errorCode: 'RUNTIME_RESTARTED',
        precedingEvents: recoveredMessages,
        runId: run.id,
        status: 'failed',
      })
    }
    return interrupted.length
  }

  async #recoverInterruptedCompaction(run: RunRecord): Promise<boolean> {
    if (run.purpose !== 'conversation.compaction')
      return false

    const events = await this.#options.eventLog.read(run.id)
    const completionRecorded = events.some(
      event => event.type === 'context.compaction.completed',
    )
    let evidence: CommittedPiCompactionEvidence | null = null
    if (run.piSessionFile && this.#options.inspectCommittedCompaction) {
      try {
        evidence = await this.#options.inspectCommittedCompaction(run)
      }
      catch (error) {
        const errorCode = readStableRunErrorCode(error)
        if (!completionRecorded && errorCode === 'SESSION_STORAGE_UNAVAILABLE') {
          await this.#finalize(run.id, 'failed', errorCode)
          return true
        }
      }
    }
    if (!completionRecorded && !evidence)
      return false

    if (!completionRecorded && evidence) {
      await this.#options.eventLog.append({
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
        await this.#options.usage.record({
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
    await this.#finalize(run.id, 'completed', null)
    return true
  }

  #finalize(
    runId: string,
    status: 'completed' | 'failed',
    errorCode: string | null,
  ) {
    return this.#options.lifecycle.finalize({
      completedAt: this.#timestamp(),
      errorCode,
      runId,
      status,
    })
  }

  #timestamp(): string {
    this.#lastTimestamp = Math.max(Date.now(), this.#lastTimestamp + 1)
    return new Date(this.#lastTimestamp).toISOString()
  }
}
