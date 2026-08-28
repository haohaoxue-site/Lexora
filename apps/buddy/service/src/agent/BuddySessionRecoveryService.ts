import type {
  Api,
  AssistantMessage,
  Model,
  UserMessage,
} from '@earendil-works/pi-ai'
import type { AttachmentService } from '../attachments/AttachmentService'
import type { ProviderExecutionModelResolver } from '../providers/ProviderExecutionModelResolver'
import type { ConversationHistoryRepository } from '../storage/conversationHistoryRepository'
import type { RunInputRepository } from '../storage/runInputRepository'
import type { RunRecord } from '../storage/runRecord'
import type { RunRepository } from '../storage/runRepository'
import { BuddyAgentRunError } from '../runs/runError'
import { createBuddyRecoveryMessages } from './createBuddyRecoveryMessages'

export type BuddySessionRecoveryPoint
  = | { kind: 'before_message', messageId: string }
    | { kind: 'branch_head' }

export interface BuddySessionRecoveryResult {
  messages: Array<AssistantMessage | UserMessage>
  missingAttachmentIds: readonly string[]
  recoveredImageCount: number
}

export interface CreateBuddySessionRecoveryInput {
  branchId: string
  conversationId: string
  fallbackModel: Model<Api>
  point: BuddySessionRecoveryPoint
}

export interface BuddySessionRecoveryServiceOptions {
  attachments: Pick<AttachmentService, 'materializeRecoveryImages'>
  conversations: Pick<ConversationHistoryRepository, 'listBranchMessages'>
  models: Pick<ProviderExecutionModelResolver, 'resolve'>
  runInputs: Pick<RunInputRepository, 'findByTriggeringMessageId'>
  runs: Pick<RunRepository, 'findById'>
}

export function resolveRunSessionRecoveryPoint(
  run: Pick<RunRecord, 'purpose' | 'triggeringMessageId'>,
): BuddySessionRecoveryPoint {
  return run.purpose === 'conversation.compaction'
    ? { kind: 'branch_head' }
    : { kind: 'before_message', messageId: run.triggeringMessageId }
}

export class BuddySessionRecoveryService {
  readonly #options: BuddySessionRecoveryServiceOptions

  constructor(options: BuddySessionRecoveryServiceOptions) {
    this.#options = options
  }

  async create(input: CreateBuddySessionRecoveryInput): Promise<BuddySessionRecoveryResult> {
    const history = this.#options.conversations.listBranchMessages(
      input.conversationId,
      input.branchId,
    )
    const triggeringMessageId = input.point.kind === 'before_message'
      ? input.point.messageId
      : null
    const boundary = triggeringMessageId === null
      ? history.length
      : history.findIndex(message => message.id === triggeringMessageId)
    if (boundary < 0)
      throw new BuddyAgentRunError('CONVERSATION_BINDING_MISMATCH')

    const missingAttachmentIds = new Set<string>()
    const recoveredUserInputs = new Map<string, {
      images: Awaited<ReturnType<AttachmentService['materializeRecoveryImages']>>['images']
      prompt: string
    }>()
    let recoveredImageCount = 0
    for (const message of history.slice(0, boundary)) {
      if (message.role !== 'user')
        continue
      const storedInput = this.#options.runInputs.findByTriggeringMessageId(message.id)
      if (!storedInput)
        continue
      const recovery = await this.#options.attachments.materializeRecoveryImages(
        storedInput.attachmentIds,
        input.conversationId,
      )
      recoveredImageCount += recovery.images.length
      for (const attachmentId of recovery.missingAttachmentIds)
        missingAttachmentIds.add(attachmentId)
      recoveredUserInputs.set(message.id, {
        images: recovery.images,
        prompt: storedInput.prompt,
      })
    }

    return {
      messages: createBuddyRecoveryMessages({
        fallbackModel: input.fallbackModel,
        messages: history,
        resolveRunModel: runId => this.#resolveRunModel(runId),
        resolveUserInput: messageId => recoveredUserInputs.get(messageId) ?? null,
        triggeringMessageId,
      }),
      missingAttachmentIds: [...missingAttachmentIds],
      recoveredImageCount,
    }
  }

  #resolveRunModel(runId: string): Model<Api> | null {
    const run = this.#options.runs.findById(runId)
    if (!run)
      return null
    try {
      return this.#options.models.resolve({
        contextWindow: run.contextWindow,
        maxTokens: run.maxTokens,
        modelId: run.model,
        providerId: run.provider,
      })
    }
    catch {
      return null
    }
  }
}
