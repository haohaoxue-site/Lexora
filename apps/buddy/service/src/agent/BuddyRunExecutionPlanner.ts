import type { AttachmentService } from '../attachments/AttachmentService'
import type { CommandRequestRepository } from '../storage/commandRequestRepository'
import type { ConversationRepository } from '../storage/conversationRepository'
import type { RunInputRepository } from '../storage/runInputRepository'
import type { RunRepository } from '../storage/runRepository'
import type {
  StartBuddyCompactionInput,
  StartBuddyTurnInput,
} from './BuddyAgentRun'
import type { BuddySessionBlueprintService } from './BuddySessionBlueprint'
import { BuddyAgentRunError } from '../runs/runError'

export type BuddyRunExecutionPlan
  = | { input: StartBuddyTurnInput, kind: 'turn' }
    | { input: StartBuddyCompactionInput, kind: 'compaction' }

export interface BuddyRunExecutionPlannerOptions {
  attachments: Pick<AttachmentService, 'materializePrompt'>
  commands: Pick<CommandRequestRepository, 'findByRunId'>
  conversations: Pick<ConversationRepository, 'findById'>
  runInputs: Pick<RunInputRepository, 'findByRunId'>
  runs: Pick<RunRepository, 'findById'>
  sessions: Pick<BuddySessionBlueprintService, 'createForConversation'>
}

export class BuddyRunExecutionPlanner {
  readonly #options: BuddyRunExecutionPlannerOptions

  constructor(options: BuddyRunExecutionPlannerOptions) {
    this.#options = options
  }

  async resolve(runId: string): Promise<BuddyRunExecutionPlan> {
    const run = this.#options.runs.findById(runId)
    if (!run)
      throw new BuddyAgentRunError('RUN_NOT_FOUND')
    if (run.status !== 'queued')
      throw new BuddyAgentRunError('RUN_STATE_MISMATCH')

    const conversation = this.#options.conversations.findById(run.conversationId)
    if (
      !conversation
      || conversation.deletedAt !== null
      || conversation.activeBranchId !== run.branchId
    ) {
      throw new BuddyAgentRunError('CONVERSATION_BINDING_MISMATCH')
    }
    const session = await this.#options.sessions.createForConversation({
      approvalPolicy: run.approvalPolicy,
      branchId: run.branchId,
      conversationId: run.conversationId,
      executionProfile: run.executionProfile,
      executionContext: run.executionContext,
      spaceId: conversation.spaceId,
      sessionMode: run.purpose === 'automation'
        ? 'automation_background'
        : 'interactive',
    })
    const common = {
      runId: run.id,
      session,
    }

    if (run.purpose === 'conversation.compaction') {
      const command = this.#options.commands.findByRunId(run.id)
      if (
        !command
        || command.command !== 'compact'
        || command.conversationId !== run.conversationId
        || command.branchId !== run.branchId
        || !run.piSessionFile
      ) {
        throw new BuddyAgentRunError('CONVERSATION_BINDING_MISMATCH')
      }
      return {
        input: {
          ...common,
          customInstructions: command.arguments,
        },
        kind: 'compaction',
      }
    }

    const input = this.#options.runInputs.findByRunId(run.id)
    if (!input?.prompt.trim())
      throw new BuddyAgentRunError('RUN_INPUT_NOT_FOUND')
    const attachments = await this.#options.attachments.materializePrompt(
      input.attachmentIds,
      '',
      run.conversationId,
    )
    return {
      input: {
        ...common,
        images: attachments.images,
        prompt: input.prompt,
        serviceTier: input.serviceTier,
        thinkingLevel: input.reasoning ?? undefined,
      },
      kind: 'turn',
    }
  }
}
