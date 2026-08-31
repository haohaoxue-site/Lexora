import type { BuddyThinkingLevel } from '../../../shared/modelSelection'
import type { ProviderExecutionModelResolver } from '../providers/ProviderExecutionModelResolver'
import type { ConversationRepository } from '../storage/conversationRepository'
import type { RunRepository } from '../storage/runRepository'
import type { BuddySessionBlueprint } from './BuddySessionBlueprint'
import type { BuddySessionRecoveryService } from './BuddySessionRecoveryService'
import type { BuddySessionCompositionServices } from './createBuddySessionComposition'
import { BuddyAgentRunError } from '../runs/runError'
import { resolveRunSessionRecoveryPoint } from './BuddySessionRecoveryService'
import { createBuddySession } from './createBuddySession'
import { createBuddySessionComposition } from './createBuddySessionComposition'
import { createReusableBuddySession } from './createReusableBuddySession'

export interface BuddySessionFactoryOptions {
  agentDirectory: string
  conversations: Pick<ConversationRepository, 'findById'>
  conversationsDirectory: string
  models: Pick<
    ProviderExecutionModelResolver,
    'resolveAvailable' | 'resolveSession'
  >
  recovery: Pick<BuddySessionRecoveryService, 'create'>
  runs: Pick<RunRepository, 'findById'>
  services: BuddySessionCompositionServices
}

export interface BuddySessionFactoryInput {
  blueprint: BuddySessionBlueprint
  piSessionFile: string | null
  runId: string
  signal: AbortSignal
  thinkingLevel?: BuddyThinkingLevel
}

export class BuddySessionFactory {
  readonly #options: BuddySessionFactoryOptions

  constructor(options: BuddySessionFactoryOptions) {
    this.#options = options
  }

  async create(input: BuddySessionFactoryInput) {
    const { blueprint } = input
    const run = this.#options.runs.findById(input.runId)
    const conversation = this.#options.conversations.findById(blueprint.conversationId)
    const expectedSessionMode = run?.purpose === 'automation'
      ? 'automation_background'
      : 'interactive'
    if (
      !run
      || run.status !== 'running'
      || !conversation
      || conversation.deletedAt !== null
      || conversation.activeBranchId !== blueprint.branchId
      || conversation.id !== run.conversationId
      || conversation.projectId !== (blueprint.project?.id ?? null)
      || conversation.executionProfile !== blueprint.executionProfile
      || run.branchId !== blueprint.branchId
      || run.executionProfile !== blueprint.executionProfile
      || run.piSessionFile !== input.piSessionFile
      || blueprint.grants[0]?.canonicalRoot !== blueprint.canonicalRoot
      || blueprint.grants[0]?.projectId !== (blueprint.project?.id ?? blueprint.conversationId)
      || !blueprint.grants.some(grant => grant.canonicalRoot === blueprint.scratchRoot)
      || blueprint.sessionMode !== expectedSessionMode
    ) {
      throw new BuddyAgentRunError('CONVERSATION_BINDING_MISMATCH')
    }

    const selected = await this.#options.models.resolveSession({
      contextWindow: run.contextWindow,
      maxTokens: run.maxTokens,
      modelId: run.model,
      providerId: run.provider,
    })
    const composition = await createBuddySessionComposition({
      canonicalRoot: blueprint.canonicalRoot,
      conversationId: blueprint.conversationId,
      executionProfile: blueprint.executionProfile,
      grants: blueprint.grants,
      scratchRoot: blueprint.scratchRoot,
      sessionMode: blueprint.sessionMode,
      signal: input.signal,
      services: this.#options.services,
    })
    const recoveryState: {
      result: Awaited<ReturnType<BuddySessionRecoveryService['create']>> | null
    } = { result: null }
    const session = await createBuddySession({
      agentDir: this.#options.agentDirectory,
      branchId: blueprint.branchId,
      canonicalRoot: blueprint.canonicalRoot,
      conversationsDirectory: this.#options.conversationsDirectory,
      conversationId: blueprint.conversationId,
      cwd: blueprint.canonicalRoot,
      executionProfile: blueprint.executionProfile,
      getServiceTier: composition.getServiceTier,
      inProcessExtensions: composition.inProcessExtensions,
      model: selected.model,
      modelRuntime: selected.runtime,
      piSessionFile: input.piSessionFile ?? undefined,
      recoveryMessages: async () => {
        recoveryState.result = await this.#options.recovery.create({
          branchId: blueprint.branchId,
          conversationId: blueprint.conversationId,
          fallbackModel: selected.model,
          point: resolveRunSessionRecoveryPoint(run),
        })
        return recoveryState.result.messages
      },
      resources: blueprint.resources,
      thinkingLevel: input.thinkingLevel,
    })

    return {
      piSessionFile: session.piSessionFile,
      recoveredFromProductHistory: session.recoveredFromProductHistory,
      recoveryDegradation: session.recoveredFromProductHistory
        && recoveryState.result
        && recoveryState.result.missingAttachmentIds.length > 0
        ? {
            missingAttachmentIds: recoveryState.result.missingAttachmentIds,
            recoveredImageCount: recoveryState.result.recoveredImageCount,
          }
        : undefined,
      session: createReusableBuddySession({
        assertModelAccess: async (provider, model, contextWindow, maxTokens) => {
          return this.#options.models.resolveAvailable({
            contextWindow,
            maxTokens,
            modelId: model,
            providerId: provider,
          })
        },
        runContext: composition.runContext,
        session: session.session,
        shutdown: session.shutdown,
      }),
    }
  }
}
