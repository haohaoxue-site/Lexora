import type { AttachmentService } from '../attachments/AttachmentService'
import type { ChangeCaptureService } from '../changes/ChangeCaptureService'
import type { BuddyRunEvent } from '../events/BuddyRunEvent'
import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { ArtifactRecord, ArtifactRepository } from '../storage/artifactRepository'
import type { ConversationHistoryRepository } from '../storage/conversationHistoryRepository'
import type { ConversationIndexRepository } from '../storage/conversationIndexRepository'
import type { ConversationModelSelection } from '../storage/conversationRecord'
import type { ConversationRepository } from '../storage/conversationRepository'
import type { ConversationTimelineRepository } from '../storage/conversationTimelineRepository'
import type { RunInputRepository } from '../storage/runInputRepository'
import type { RunRepository } from '../storage/runRepository'
import { z } from 'zod'
import { BUDDY_EXECUTION_PROFILES } from '../../../shared/executionProfile'
import {
  BUDDY_SERVICE_TIERS,
  BUDDY_THINKING_LEVELS,
} from '../../../shared/modelSelection'
import { toPublicRunEvent } from '../../../shared/publicRunEvent'
import { buddyRunOutputPayloadSchema } from '../../../shared/runOutput'
import {
  withMessageAttachments,
} from '../attachments/publicAttachment'
import { BuddyServiceError, parse } from '../rpc/runtimeRequest'
import { toPublicRun } from '../runs/publicRun'
import {
  createConversationTimelineCursor,
  parseConversationTimelineCursor,
} from './conversationTimelineCursor'
import {
  createMessagePageCursor,
  parseMessagePageCursor,
} from './messagePageCursor'

const idSchema = z.string().trim().min(1).max(256)
const limitSchema = z.number().int().positive().max(500).optional()
const executionProfileSchema = z.enum(BUDDY_EXECUTION_PROFILES)
const modelSelectionSchema = z.object({
  modelId: idSchema,
  providerId: idSchema,
  reasoning: z.enum(BUDDY_THINKING_LEVELS).nullable(),
  serviceTier: z.enum(BUDDY_SERVICE_TIERS).nullable(),
}).strict()
const conversationIdSchema = z.object({ conversationId: idSchema }).strict()
const conversationPageSchema = z.object({
  branchId: idSchema.optional(),
  conversationId: idSchema,
  cursor: z.string().regex(/^[\w-]+$/).max(2_048).optional(),
  limit: limitSchema,
}).strict()

export interface ConversationSessionInvalidator {
  invalidateConversation: (conversationId: string) => Promise<unknown>
}

type ConversationRpcRepository = Pick<
  ConversationRepository,
  | 'activateBranch'
  | 'findById'
  | 'rename'
  | 'setExecutionProfile'
  | 'setModelSelection'
> & Pick<
  ConversationHistoryRepository,
  'listBranches' | 'listMessagePage'
> & ConversationIndexRepository & ConversationTimelineRepository

export interface RegisterConversationRpcOptions {
  artifacts: Pick<ArtifactRepository, 'listForConversation'>
  attachments: Pick<AttachmentService, 'listForConversation'>
  changes: Pick<ChangeCaptureService, 'listSummariesForRuns'>
  conversations: ConversationRpcRepository
  deleteConversation: (conversationId: string) => Promise<boolean>
  eventLog: { listForRuns: (runIds: readonly string[]) => BuddyRunEvent[] }
  isDeleting: (conversationId: string) => boolean
  resolveModelSelection: (
    selection: ConversationModelSelection,
  ) => Promise<ConversationModelSelection>
  rpc: RuntimeRequestRegistrar
  runInputs: Pick<RunInputRepository, 'findByRunId'>
  runs: Pick<RunRepository, 'listForTimeline'>
  sessions: ConversationSessionInvalidator
}

export function registerConversationRpc(options: RegisterConversationRpcOptions): () => void {
  const disposers: Array<() => void> = []
  const on = (method: string, handler: (params: unknown) => Promise<unknown> | unknown) => {
    disposers.push(options.rpc.onRequest(method, handler))
  }

  on('conversations.list', (params) => {
    const input = parse(z.object({ limit: limitSchema }).strict(), params)
    return options.conversations.listRecent(input.limit ?? 100)
  })
  on('conversations.get', (params) => {
    const input = parse(conversationIdSchema, params)
    return requireActiveConversation(options, input.conversationId)
  })
  on('conversations.rename', (params) => {
    const input = parse(z.object({
      conversationId: idSchema,
      title: z.string().trim().min(1).max(80),
    }).strict(), params)
    return options.conversations.rename({
      id: input.conversationId,
      title: input.title,
      updatedAt: new Date().toISOString(),
    })
  })
  on('conversations.setExecutionProfile', async (params) => {
    const input = parse(z.object({
      conversationId: idSchema,
      executionProfile: executionProfileSchema,
    }).strict(), params)
    const current = requireActiveConversation(options, input.conversationId)
    if (current.executionProfile === input.executionProfile)
      return current
    const conversation = options.conversations.setExecutionProfile({
      executionProfile: input.executionProfile,
      id: input.conversationId,
      updatedAt: new Date().toISOString(),
    })
    if (!conversation)
      throw new BuddyServiceError('VALIDATION_FAILED')
    await options.sessions.invalidateConversation(input.conversationId)
    return conversation
  })
  on('conversations.setModelSelection', async (params) => {
    const input = parse(z.object({
      conversationId: idSchema,
      modelSelection: modelSelectionSchema,
    }).strict(), params)
    requireActiveConversation(options, input.conversationId)
    const selection = await options.resolveModelSelection(input.modelSelection)
    return requireValue(options.conversations.setModelSelection({
      id: input.conversationId,
      modelSelection: {
        modelId: selection.modelId,
        providerId: selection.providerId,
        reasoning: selection.reasoning,
        serviceTier: selection.serviceTier,
      },
      updatedAt: new Date().toISOString(),
    }))
  })
  on('conversations.delete', async (params) => {
    const input = parse(conversationIdSchema, params)
    return options.deleteConversation(input.conversationId)
  })
  on('conversations.activateBranch', (params) => {
    const input = parse(z.object({
      branchId: idSchema,
      conversationId: idSchema,
    }).strict(), params)
    return options.conversations.activateBranch({
      ...input,
      updatedAt: new Date().toISOString(),
    })
  })
  on('conversations.listBranches', (params) => {
    const input = parse(conversationIdSchema, params)
    requireValue(options.conversations.findById(input.conversationId))
    if (options.isDeleting(input.conversationId))
      throw new BuddyServiceError('VALIDATION_FAILED')
    return options.conversations.listBranches(input.conversationId)
  })
  on('conversations.listMessages', (params) => {
    const input = parse(conversationPageSchema, params)
    const conversation = requireActiveConversation(options, input.conversationId)
    const branchId = input.branchId ?? requireValue(conversation.activeBranchId)
    const page = options.conversations.listMessagePage(
      input.conversationId,
      branchId,
      {
        beforeMessageId: input.cursor
          ? parseMessagePageCursor(input.cursor, {
              branchId,
              conversationId: input.conversationId,
            })
          : null,
        limit: input.limit ?? 100,
      },
    )
    return {
      items: withMessageAttachments(
        page.items,
        options.attachments.listForConversation(input.conversationId),
      ),
      nextCursor: page.nextBeforeMessageId
        ? createMessagePageCursor({
            beforeMessageId: page.nextBeforeMessageId,
            branchId,
            conversationId: input.conversationId,
          })
        : null,
    }
  })
  on('conversations.listTimeline', (params) => {
    const input = parse(conversationPageSchema, params)
    const conversation = requireActiveConversation(options, input.conversationId)
    const branchId = input.branchId ?? requireValue(conversation.activeBranchId)
    const page = options.conversations.listTimelinePage(
      input.conversationId,
      branchId,
      {
        before: input.cursor
          ? parseConversationTimelineCursor(input.cursor, {
              branchId,
              conversationId: input.conversationId,
            })
          : null,
        limit: input.limit ?? 100,
      },
    )
    const items = withMessageAttachments(
      page.items,
      options.attachments.listForConversation(input.conversationId),
    )
    const messageItems = items.filter(item => item.kind === 'message')
    const runs = options.runs.listForTimeline(
      input.conversationId,
      branchId,
      messageItems.filter(item => item.role === 'user').map(item => item.id),
      messageItems.flatMap(item => item.runId ? [item.runId] : []),
    )
    const runEvents = options.eventLog.listForRuns(runs.map(run => run.id))
    return {
      changeSets: options.changes.listSummariesForRuns(runs.map(run => run.id)),
      items,
      nextCursor: page.nextBefore
        ? createConversationTimelineCursor({
            before: page.nextBefore,
            branchId,
            conversationId: input.conversationId,
          })
        : null,
      outputs: projectRunOutputs(
        runEvents,
        options.artifacts.listForConversation(input.conversationId),
      ),
      runEvents: runEvents.map(toPublicRunEvent),
      runs: runs.map(run => toPublicRun(
        run,
        options.runInputs.findByRunId(run.id)?.reasoning ?? null,
      )),
    }
  })

  return () => disposers.splice(0).forEach(dispose => dispose())
}

function requireActiveConversation(
  options: Pick<RegisterConversationRpcOptions, 'conversations'>,
  conversationId: string,
) {
  const conversation = requireValue(options.conversations.findById(conversationId))
  if (conversation.deletedAt !== null)
    throw new BuddyServiceError('VALIDATION_FAILED')
  return conversation
}

function requireValue<T>(value: T | null): T {
  if (value === null)
    throw new BuddyServiceError('VALIDATION_FAILED')
  return value
}

function projectRunOutputs(
  events: readonly BuddyRunEvent[],
  artifacts: readonly ArtifactRecord[],
) {
  const artifactsById = new Map(artifacts.map(record => [record.id, record]))
  const projectedArtifactIds = new Set<string>()
  return events.flatMap((event) => {
    if (event.type !== 'output.produced')
      return []
    const output = buddyRunOutputPayloadSchema.safeParse(event.payload)
    if (!output.success)
      return []
    const projectedArtifacts = output.data.artifactIds.flatMap((artifactId) => {
      if (projectedArtifactIds.has(artifactId))
        return []
      const artifact = artifactsById.get(artifactId)
      if (!artifact)
        return []
      projectedArtifactIds.add(artifactId)
      return [toPublicArtifact(artifact)]
    })
    return projectedArtifacts.length > 0
      ? [{
          artifacts: projectedArtifacts,
          createdAt: event.createdAt,
          runId: event.runId,
          sourceToolCallId: output.data.sourceToolCallId,
        }]
      : []
  })
}

function toPublicArtifact(record: ArtifactRecord) {
  return {
    artifactId: record.id,
    conversationId: record.conversationId,
    createdAt: record.createdAt,
    mimeType: record.mimeType,
    name: record.name,
    previewUrl: null,
    runId: record.runId,
    sizeBytes: record.sizeBytes,
    sourceArtifactId: record.sourceArtifactId,
    sourceToolCallId: record.sourceToolCallId,
  }
}
