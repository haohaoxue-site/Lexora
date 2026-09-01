import type { BuddyTurnLauncher } from '../agent/BuddyTurnLauncher'
import type { ConversationLifecycleService } from '../conversations/ConversationLifecycleService'
import type {
  CommandRequestRecord,
  CommandRequestRepository,
} from '../storage/commandRequestRepository'
import type { ConversationRepository } from '../storage/conversationRepository'
import type { RunRecord } from '../storage/runRecord'
import type { RunRepository } from '../storage/runRepository'
import type { SpaceRepository } from '../storage/spaceRepository'
import { createHash, randomUUID } from 'node:crypto'
import { BuddyServiceError } from '../rpc/runtimeRequest'
import { toPublicRun } from '../runs/publicRun'
import { requireActiveSpace } from '../spaces/requireActiveSpace'

export interface ExecuteChatCommandInput {
  arguments: string
  branchId: string
  command: 'compact'
  conversationId: string
  requestId: string
}

export interface ChatCommandServiceOptions {
  commands: CommandRequestRepository
  conversationLifecycle: Pick<ConversationLifecycleService, 'isDeleting'>
  conversations: Pick<ConversationRepository, 'findById'>
  spaces: Pick<SpaceRepository, 'findById'>
  runs: Pick<RunRepository, 'findById'>
  turnLauncher: Pick<BuddyTurnLauncher, 'launch'>
}

export class ChatCommandService {
  readonly #options: ChatCommandServiceOptions

  constructor(options: ChatCommandServiceOptions) {
    this.#options = options
  }

  async execute(input: ExecuteChatCommandInput) {
    const requestFingerprint = createCommandFingerprint(input)
    const replay = this.#options.commands.findByRequestId(input.requestId)
    const replayRun = replay ? this.#requireRun(replay.runId) : null
    if (replay) {
      if (replay.requestFingerprint !== requestFingerprint)
        throw new BuddyServiceError('VALIDATION_FAILED')
      const run = requireValue(replayRun)
      if (run.status !== 'failed' || run.errorCode !== 'RUNTIME_RESTARTED')
        return toTurnStart(replay, run)
    }

    const conversation = requireValue(this.#options.conversations.findById(input.conversationId))
    if (
      conversation.activeBranchId !== input.branchId
      || this.#options.conversationLifecycle.isDeleting(conversation.id)
    ) {
      throw new BuddyServiceError('VALIDATION_FAILED')
    }
    if (conversation.spaceId)
      requireActiveSpace(this.#options.spaces.findById(conversation.spaceId))
    const runId = randomUUID()
    const prepared = replay
      ? this.#options.commands.retryInterrupted({
          createdAt: new Date().toISOString(),
          requestId: input.requestId,
          runId,
        })
      : this.#options.commands.prepare({
          ...input,
          createdAt: new Date().toISOString(),
          executionProfile: conversation.executionProfile,
          requestFingerprint,
          runId,
        })
    if (!prepared.created)
      return toTurnStart(prepared, this.#requireRun(prepared.runId))

    const operation = await this.#options.turnLauncher.launch(prepared.runId)
    void operation.completion
    return toTurnStart(prepared, this.#requireRun(operation.runId))
  }

  #requireRun(runId: string): RunRecord {
    return requireValue(this.#options.runs.findById(runId))
  }
}

function createCommandFingerprint(input: ExecuteChatCommandInput): string {
  return createHash('sha256').update(JSON.stringify({
    arguments: input.arguments.trim(),
    branchId: input.branchId,
    command: input.command,
    conversationId: input.conversationId,
  })).digest('hex')
}

function toTurnStart(request: CommandRequestRecord, run: RunRecord) {
  return {
    branchId: request.branchId,
    conversationId: request.conversationId,
    run: toPublicRun(run, null),
    runId: request.runId,
  }
}

function requireValue<T>(value: T | null): T {
  if (value === null)
    throw new BuddyServiceError('VALIDATION_FAILED')
  return value
}
