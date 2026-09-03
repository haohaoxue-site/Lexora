import type { BuddyExecutionProfile } from '../../../shared/executionProfile'
import type {
  BuddyServiceTier,
  BuddyThinkingLevel,
} from '../../../shared/modelSelection'
import type { BuddySessionBlueprintService } from '../agent/BuddySessionBlueprint'
import type { BuddySessionRecoveryService } from '../agent/BuddySessionRecoveryService'
import type { BuddyContextSnapshot } from '../agent/createBuddySession'
import type { BuddySessionCompositionServices } from '../agent/createBuddySessionComposition'
import type { ProviderExecutionModelResolver } from '../providers/ProviderExecutionModelResolver'
import type { BuddyDataPaths } from '../storage/BuddyDataPaths'
import type { ConversationHistoryRepository } from '../storage/conversationHistoryRepository'
import type { ConversationRepository } from '../storage/conversationRepository'
import type { RunRepository } from '../storage/runRepository'
import { createBuddyContextSnapshot } from '../agent/createBuddySession'
import { createBuddySessionComposition } from '../agent/createBuddySessionComposition'
import { BuddyServiceError } from '../rpc/runtimeRequest'

export interface ContextUsageModelSelection {
  modelId: string
  providerId: string
  reasoning: BuddyThinkingLevel | null
  serviceTier: BuddyServiceTier | null
}

export interface ContextUsageSnapshotInput {
  branchId: string | null
  conversationId: string | null
  draftId: string
  executionProfile: BuddyExecutionProfile
  modelSelection: ContextUsageModelSelection
  spaceId: string | null
}

export interface ContextUsageSnapshotServiceOptions {
  agentDirectory: string
  blueprints: Pick<
    BuddySessionBlueprintService,
    'createForConversation' | 'createForDraft'
  >
  conversations: Pick<ConversationRepository, 'findById'>
    & Pick<ConversationHistoryRepository, 'listBranches'>
  models: Pick<ProviderExecutionModelResolver, 'resolveSession'>
  paths: Pick<BuddyDataPaths, 'conversationsDirectory'>
  recovery: Pick<BuddySessionRecoveryService, 'create'>
  runs: Pick<RunRepository, 'findLatestForBranch'>
  sessionCompositionServices: BuddySessionCompositionServices
}

type ReadyBuddyContextSnapshot = Exclude<BuddyContextSnapshot, null>

export type ContextUsageSnapshot = {
  contextWindow: number
  createdAt: string
  modelId: string
  providerId: string
} & (
  | { status: 'pending' }
  | ReadyBuddyContextSnapshot & { status: 'ready' }
)

export interface ContextUsageSnapshotReader {
  getSnapshot: (input: ContextUsageSnapshotInput) => Promise<ContextUsageSnapshot>
}

export class ContextUsageSnapshotService implements ContextUsageSnapshotReader {
  readonly #options: ContextUsageSnapshotServiceOptions

  constructor(options: ContextUsageSnapshotServiceOptions) {
    this.#options = options
  }

  async getSnapshot(input: ContextUsageSnapshotInput): Promise<ContextUsageSnapshot> {
    const conversation = input.conversationId
      ? this.#options.conversations.findById(input.conversationId)
      : null
    if (input.conversationId && !conversation)
      throw new BuddyServiceError('VALIDATION_FAILED')
    if (
      conversation
      && (
        conversation.deletedAt !== null
        || conversation.spaceId !== input.spaceId
        || conversation.executionProfile !== input.executionProfile
        || !input.branchId
        || !this.#options.conversations.listBranches(conversation.id).some(
          branch => branch.id === input.branchId,
        )
      )
    ) {
      throw new BuddyServiceError('VALIDATION_FAILED')
    }

    const executionProfile = conversation?.executionProfile ?? input.executionProfile
    const selected = await this.#options.models.resolveSession({
      contextWindow: null,
      maxTokens: null,
      modelId: input.modelSelection.modelId,
      providerId: input.modelSelection.providerId,
    })
    const branchId = input.branchId ?? 'context-preview'
    const latestRun = conversation
      ? this.#options.runs.findLatestForBranch(conversation.id, branchId)
      : null
    const blueprint = conversation
      ? await this.#options.blueprints.createForConversation({
          branchId,
          conversationId: conversation.id,
          executionProfile,
          spaceId: conversation.spaceId,
          sessionMode: 'interactive',
        })
      : await this.#options.blueprints.createForDraft({
          draftId: input.draftId,
          executionProfile,
          spaceId: input.spaceId,
        })
    const composition = await createBuddySessionComposition({
      canonicalRoot: blueprint.canonicalRoot,
      conversationId: blueprint.conversationId,
      executionProfile: blueprint.executionProfile,
      grants: blueprint.grants,
      sessionMode: blueprint.sessionMode,
      signal: new AbortController().signal,
      spaceId: blueprint.space?.id ?? null,
      services: this.#options.sessionCompositionServices,
    })
    const snapshot = await createBuddyContextSnapshot({
      agentDir: this.#options.agentDirectory,
      branchId: blueprint.branchId,
      canonicalRoot: blueprint.canonicalRoot,
      conversationsDirectory: this.#options.paths.conversationsDirectory,
      conversationId: blueprint.conversationId,
      cwd: blueprint.canonicalRoot,
      executionProfile: blueprint.executionProfile,
      getServiceTier: composition.getServiceTier,
      inProcessExtensions: composition.inProcessExtensions,
      model: selected.model,
      modelRuntime: selected.runtime,
      piSessionFile: latestRun?.piSessionFile ?? undefined,
      recoveryMessages: conversation
        ? async () => (await this.#options.recovery.create({
          branchId: blueprint.branchId,
          conversationId: conversation.id,
          fallbackModel: selected.model,
          point: { kind: 'branch_head' },
        })).messages
        : [],
      resources: blueprint.resources,
      thinkingLevel: input.modelSelection.reasoning ?? undefined,
    })
    const identity = {
      contextWindow: selected.model.contextWindow,
      createdAt: new Date().toISOString(),
      modelId: selected.model.id,
      providerId: selected.model.provider,
    }
    if (!snapshot)
      return { ...identity, status: 'pending' }

    return {
      ...snapshot,
      ...identity,
      status: 'ready',
    }
  }
}
