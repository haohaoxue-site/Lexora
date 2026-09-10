import type { LocalChatQueueScope, LocalChatQueueTarget } from '../../../shared/conversation/chatQueueApi'
import type { BuddyAgentRunner } from '../agent/execution/BuddyAgentRunner'
import type { BuddyTurnLauncher } from '../agent/execution/BuddyTurnLauncher'
import type { BuddyStartTurnInput } from '../BuddyRuntime'
import type { ChatQueueRepository } from '../storage/chatQueueRepository'
import type { RunRepository } from '../storage/runRepository'
import type { TurnRequestRepository } from '../storage/turnRequestRepository'
import type { ChatTurnService } from './ChatTurnService'
import { createHash } from 'node:crypto'
import { createBuddyInputReference } from '../agent/context/BuddyInputReference'
import { BuddyServiceError } from '../rpc/runtimeRequest'

export interface ChatQueueServiceOptions {
  queue: ChatQueueRepository
  turns: Pick<ChatTurnService, 'prepareStart'>
  requests: Pick<TurnRequestRepository, 'prepare'>
  launcher: Pick<BuddyTurnLauncher, 'launch'>
  runner: Pick<BuddyAgentRunner, 'steer'>
  runs: Pick<RunRepository, 'findById'>
}

export class ChatQueueService {
  readonly #options: ChatQueueServiceOptions
  readonly #draining = new Set<string>()
  #disposed = false

  constructor(options: ChatQueueServiceOptions) {
    this.#options = options
    options.queue.pause()
  }

  dispose() {
    this.#disposed = true
  }

  list(scope: LocalChatQueueScope) {
    return this.#options.queue.list(scope)
  }

  async enqueue(input: BuddyStartTurnInput) {
    const fingerprint = createHash('sha256').update(JSON.stringify([input.draftId, input.expectedRevision])).digest('hex')
    const replay = this.#options.queue.replay(input.requestId, fingerprint)
    if (replay)
      return replay
    const { prepared, stagedAttachments } = await this.#options.turns.prepareStart(input)
    let result
    try {
      if (this.#disposed)
        throw new BuddyServiceError('VALIDATION_FAILED')
      const concurrent = this.#options.queue.replay(input.requestId, fingerprint)
      if (concurrent) {
        await stagedAttachments.rollback()
        return concurrent
      }
      result = this.#options.queue.enqueue({ ...prepared, requestFingerprint: fingerprint })
    }
    catch (error) {
      await stagedAttachments.rollback()
      throw error
    }
    await stagedAttachments.commit().catch(() => undefined)
    this.#schedule(result)
    return result
  }

  cancel(target: LocalChatQueueTarget) {
    const cancelled = this.#options.queue.cancel(target)
    if (cancelled)
      this.#schedule(target)
    return cancelled
  }

  async steer(target: LocalChatQueueTarget) {
    if (this.#disposed)
      return false
    const input = this.#options.queue.pending(target)
    if (!input)
      return false
    const active = this.#options.queue.activeRun(target)
    if (!active)
      return this.#dispatch(target)
    if (active.purpose !== 'chat' || active.model !== input.model || active.provider !== input.provider)
      throw new BuddyServiceError('VALIDATION_FAILED')
    return this.#options.runner.steer(active.id, () => {
      const reference = createBuddyInputReference({
        messageId: input.userMessageId,
        prompt: input.runInput.prompt,
        images: input.attachmentBindings.flatMap((binding) => {
          const metadata = binding.mimeType
          return metadata?.startsWith('image/') && metadata !== 'image/svg+xml' ? [{ attachmentId: binding.id, mimeType: metadata }] : []
        }),
      })
      this.#options.queue.commitSteering(input, active.id)
      return reference
    })
  }

  onRunSettled(runId: string) {
    if (this.#disposed)
      return
    const run = this.#options.runs.findById(runId)
    if (!run)
      return
    if (run.status !== 'completed') {
      this.#options.queue.pause(run.conversationId)
      return
    }
    this.#schedule(run)
  }

  #schedule(scope: LocalChatQueueScope) {
    setTimeout(() => {
      void this.#dispatchNext(scope).catch(() => {
        if (!this.#disposed)
          this.#options.queue.pause(scope.conversationId)
      })
    }, 0)
  }

  async #dispatchNext(scope: LocalChatQueueScope) {
    if (this.#disposed || this.#options.queue.activeRun(scope))
      return
    const next = this.#options.queue.list(scope)[0]
    if (next?.state === 'waiting')
      await this.#dispatch(next)
  }

  async #dispatch(target: LocalChatQueueTarget) {
    if (this.#disposed || this.#draining.has(target.conversationId) || this.#options.queue.activeRun(target))
      return false
    const input = this.#options.queue.pending(target)
    if (!input)
      return false
    this.#draining.add(target.conversationId)
    try {
      const prepared = this.#options.requests.prepare({ ...input, createdAt: new Date().toISOString() })
      const turn = await this.#options.launcher.launch(prepared.runId)
      void turn.completion.then(() => this.onRunSettled(turn.runId), () => {
        if (!this.#disposed)
          this.#options.queue.pause(target.conversationId)
      })
      return true
    }
    finally {
      this.#draining.delete(target.conversationId)
    }
  }
}
