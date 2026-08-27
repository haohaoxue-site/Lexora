import type { DatabaseSync } from 'node:sqlite'
import type { BuddyExecutionProfile } from '../../../shared/executionProfile'
import type { BuddyServiceTier, BuddyThinkingLevel } from '../../../shared/modelSelection'
import { withTransaction } from './database'

export type MessageRole = 'user' | 'assistant' | 'tool'

export interface ConversationModelSelection {
  modelId: string
  providerId: string
  reasoning: BuddyThinkingLevel | null
  serviceTier: BuddyServiceTier | null
}

export interface ConversationRecord {
  id: string
  projectId: string | null
  title: string | null
  activeBranchId: string | null
  createdAt: string
  executionProfile: BuddyExecutionProfile
  modelSelection: ConversationModelSelection | null
  origin: 'automation' | 'interactive'
  deletedAt: string | null
  updatedAt: string
}

export type ConversationActivity = 'idle' | 'running' | 'awaiting_approval'

export interface ConversationSummaryRecord extends ConversationRecord {
  activity: ConversationActivity
  automationOccurrence: {
    automationId: string
    occurrenceId: string
    scheduledFor: string
  } | null
}

export interface ConversationBranchRecord {
  id: string
  conversationId: string
  parentBranchId: string | null
  forkedFromMessageId: string | null
  createdAt: string
}

export interface MessageRecord {
  id: string
  conversationId: string
  branchId: string
  runId: string | null
  role: MessageRole
  content: unknown
  createdAt: string
}

export interface MessagePageRecord {
  items: MessageRecord[]
  nextBeforeMessageId: string | null
}

export interface ConversationTimelineMessageRecord extends MessageRecord {
  kind: 'message'
}

export interface ConversationTimelineCompactionRecord {
  kind: 'compaction'
  id: string
  conversationId: string
  branchId: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  errorCode: string | null
  tokensBefore: number | null
  estimatedTokensAfter: number | null
  createdAt: string
  completedAt: string | null
}

export type ConversationTimelineItemRecord
  = | ConversationTimelineMessageRecord
    | ConversationTimelineCompactionRecord

export interface ConversationTimelineBoundaryRecord {
  branchId: string
  id: string
  kind: ConversationTimelineItemRecord['kind']
  occurredAt: string
}

export interface ConversationTimelinePageRecord {
  items: ConversationTimelineItemRecord[]
  nextBefore: ConversationTimelineBoundaryRecord | null
}

export interface ListConversationTimelinePageOptions {
  before?: ConversationTimelineBoundaryRecord | null
  limit: number
}

export interface ListMessagePageOptions {
  beforeMessageId?: string | null
  limit: number
}

export interface CreateConversationInput {
  id: string
  branchId: string
  projectId: string | null
  title: string | null
  createdAt: string
  executionProfile: BuddyExecutionProfile
  origin?: ConversationRecord['origin']
}

export interface CreateBranchInput {
  id: string
  conversationId: string
  parentBranchId: string | null
  forkedFromMessageId: string | null
  createdAt: string
  activate: boolean
}

export interface CreateMessageInput {
  id: string
  conversationId: string
  branchId: string
  runId: string | null
  role: MessageRole
  content: unknown
  createdAt: string
}

export interface ActivateConversationBranchInput {
  branchId: string
  conversationId: string
  updatedAt: string
}

export interface RenameConversationInput {
  id: string
  title: string
  updatedAt: string
}

export interface SetConversationExecutionProfileInput {
  executionProfile: BuddyExecutionProfile
  id: string
  updatedAt: string
}

export interface SetConversationModelSelectionInput {
  id: string
  modelSelection: ConversationModelSelection
  updatedAt: string
}

export interface ConversationRepository {
  activateBranch: (input: ActivateConversationBranchInput) => ConversationRecord
  create: (input: CreateConversationInput) => ConversationRecord
  createBranch: (input: CreateBranchInput) => ConversationBranchRecord
  createMessage: (input: CreateMessageInput) => MessageRecord
  findById: (id: string) => ConversationRecord | null
  findMessageById: (id: string) => MessageRecord | null
  isDeleted: (id: string) => boolean
  listBranchMessages: (conversationId: string, branchId: string) => MessageRecord[]
  listBranches: (conversationId: string) => ConversationBranchRecord[]
  listMessagePage: (
    conversationId: string,
    branchId: string,
    options: ListMessagePageOptions,
  ) => MessagePageRecord
  listTimelinePage: (
    conversationId: string,
    branchId: string,
    options: ListConversationTimelinePageOptions,
  ) => ConversationTimelinePageRecord
  listMessages: (conversationId: string, branchId: string, limit?: number) => MessageRecord[]
  listRecent: (limit?: number) => ConversationSummaryRecord[]
  markDeleted: (id: string, deletedAt: string) => boolean
  rename: (input: RenameConversationInput) => ConversationRecord
  setExecutionProfile: (
    input: SetConversationExecutionProfileInput,
  ) => ConversationRecord | null
  setModelSelection: (
    input: SetConversationModelSelectionInput,
  ) => ConversationRecord | null
}

interface ConversationRow {
  id: string
  project_id: string | null
  title: string | null
  active_branch_id: string | null
  created_at: string
  execution_profile: BuddyExecutionProfile
  model_selection_json: string | null
  origin: ConversationRecord['origin']
  deleted_at: string | null
  updated_at: string
}

interface ConversationSummaryRow extends ConversationRow {
  activity: ConversationActivity
  automation_id: string | null
  automation_occurrence_id: string | null
  automation_scheduled_for: string | null
}

interface BranchRow {
  id: string
  conversation_id: string
  parent_branch_id: string | null
  forked_from_message_id: string | null
  created_at: string
}

interface MessageRow {
  id: string
  conversation_id: string
  branch_id: string
  run_id: string | null
  role: MessageRole
  content_json: string
  created_at: string
}

interface VisibleBranchSegment {
  branchId: string
  throughMessage: MessageRow | null
}

interface ConversationTimelineRow {
  kind: 'message' | 'compaction'
  id: string
  conversation_id: string
  branch_id: string
  run_id: string | null
  role: MessageRole | null
  content_json: string | null
  status: ConversationTimelineCompactionRecord['status'] | null
  error_code: string | null
  completed_at: string | null
  compaction_payload_json: string | null
  occurred_at: string
  sort_rank: number
}

export function createConversationRepository(database: DatabaseSync): ConversationRepository {
  const findConversation = database.prepare('SELECT * FROM conversations WHERE id = ?')
  const findBranch = database.prepare('SELECT * FROM conversation_branches WHERE id = ?')
  const findMessage = database.prepare('SELECT * FROM messages WHERE id = ?')
  const insertConversation = database.prepare(`
    INSERT INTO conversations (
      id, project_id, title, active_branch_id, created_at, updated_at,
      execution_profile, origin, deleted_at
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NULL)
  `)
  const insertBranch = database.prepare(`
    INSERT INTO conversation_branches (
      id, conversation_id, parent_branch_id, forked_from_message_id, created_at
    ) VALUES (?, ?, ?, ?, ?)
  `)
  const activateBranch = database.prepare(`
    UPDATE conversations SET active_branch_id = ?, updated_at = ? WHERE id = ?
  `)
  const insertMessage = database.prepare(`
    INSERT INTO messages (
      id, conversation_id, branch_id, run_id, role, content_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const listAllMessagesForBranch = database.prepare(`
    SELECT * FROM messages
    WHERE conversation_id = ? AND branch_id = ?
    ORDER BY created_at, id
  `)
  const listNewestMessagesForBranch = database.prepare(`
    SELECT * FROM messages
    WHERE conversation_id = ? AND branch_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `)
  const listMessagesForBranchBefore = database.prepare(`
    SELECT * FROM messages
    WHERE conversation_id = ? AND branch_id = ?
      AND (created_at < ? OR (created_at = ? AND id < ?))
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `)
  const listMessagesForBranchThrough = database.prepare(`
    SELECT * FROM messages
    WHERE conversation_id = ? AND branch_id = ?
      AND (created_at < ? OR (created_at = ? AND id <= ?))
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `)
  const listBranches = database.prepare(`
    SELECT * FROM conversation_branches
    WHERE conversation_id = ?
    ORDER BY created_at, id
  `)
  const listRecent = database.prepare(`
    SELECT conversations.*,
      automation_occurrences.id AS automation_occurrence_id,
      automation_occurrences.automation_id AS automation_id,
      automation_occurrences.scheduled_for AS automation_scheduled_for,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM runs
          INNER JOIN approvals ON approvals.run_id = runs.id
          WHERE runs.conversation_id = conversations.id
            AND approvals.status = 'pending'
        ) THEN 'awaiting_approval'
        WHEN EXISTS (
          SELECT 1
          FROM runs
          WHERE runs.conversation_id = conversations.id
            AND runs.status IN ('queued', 'running')
        ) THEN 'running'
        ELSE 'idle'
      END AS activity
    FROM conversations
    LEFT JOIN automation_occurrences
      ON automation_occurrences.conversation_id = conversations.id
      AND automation_occurrences.deleted_at IS NULL
    WHERE conversations.deleted_at IS NULL
    ORDER BY conversations.updated_at DESC, conversations.created_at DESC
    LIMIT ?
  `)
  const renameConversation = database.prepare(`
    UPDATE conversations
    SET title = ?, updated_at = ?
    WHERE id = ? AND deleted_at IS NULL
  `)
  const setExecutionProfile = database.prepare(`
    UPDATE conversations
    SET execution_profile = ?, updated_at = ?
    WHERE id = ?
      AND NOT EXISTS (
        SELECT 1 FROM runs
        WHERE conversation_id = conversations.id AND status IN ('queued', 'running')
      )
      AND deleted_at IS NULL
  `)
  const setModelSelection = database.prepare(`
    UPDATE conversations
    SET model_selection_json = ?, updated_at = ?
    WHERE id = ? AND deleted_at IS NULL
  `)
  const markDeleted = database.prepare(`
    UPDATE conversations
    SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND deleted_at IS NULL
  `)
  const findIncompleteRun = database.prepare(`
    SELECT 1 FROM runs
    WHERE conversation_id = ? AND status IN ('queued', 'running')
    LIMIT 1
  `)
  const findCompactionRun = database.prepare(`
    SELECT * FROM runs
    WHERE id = ? AND purpose = 'conversation.compaction'
  `)
  const timelineProjection = `
    SELECT
      'message' AS kind,
      id,
      conversation_id,
      branch_id,
      run_id,
      role,
      content_json,
      NULL AS status,
      NULL AS error_code,
      NULL AS completed_at,
      NULL AS compaction_payload_json,
      created_at AS occurred_at,
      0 AS sort_rank
    FROM messages
    WHERE conversation_id = ? AND branch_id = ?
    UNION ALL
    SELECT
      'compaction' AS kind,
      runs.id,
      runs.conversation_id,
      runs.branch_id,
      runs.id AS run_id,
      NULL AS role,
      NULL AS content_json,
      runs.status,
      runs.error_code,
      runs.completed_at,
      (
        SELECT payload_json FROM run_events
        WHERE run_id = runs.id AND event_type = 'context.compaction.completed'
        ORDER BY sequence DESC
        LIMIT 1
      ) AS compaction_payload_json,
      runs.started_at AS occurred_at,
      1 AS sort_rank
    FROM runs
    WHERE conversation_id = ? AND branch_id = ?
      AND purpose = 'conversation.compaction'
  `
  const listNewestTimelineForBranch = database.prepare(`
    WITH timeline AS (${timelineProjection})
    SELECT * FROM timeline
    ORDER BY occurred_at DESC, sort_rank DESC, id DESC
    LIMIT ?
  `)
  const listTimelineForBranchBefore = database.prepare(`
    WITH timeline AS (${timelineProjection})
    SELECT * FROM timeline
    WHERE occurred_at < ?
      OR (
        occurred_at = ?
        AND (sort_rank < ? OR (sort_rank = ? AND id < ?))
      )
    ORDER BY occurred_at DESC, sort_rank DESC, id DESC
    LIMIT ?
  `)
  const listTimelineForBranchThrough = database.prepare(`
    WITH timeline AS (${timelineProjection})
    SELECT * FROM timeline
    WHERE occurred_at < ?
      OR (
        occurred_at = ?
        AND (sort_rank < ? OR (sort_rank = ? AND id <= ?))
      )
    ORDER BY occurred_at DESC, sort_rank DESC, id DESC
    LIMIT ?
  `)
  const collectBranchMessages = (
    conversationId: string,
    branchId: string,
    visited = new Set<string>(),
  ): MessageRecord[] => {
    if (visited.has(branchId))
      throw new Error('Lexora Buddy conversation branch ancestry is invalid')
    visited.add(branchId)
    const branch = findBranch.get(branchId) as BranchRow | undefined
    if (!branch || branch.conversation_id !== conversationId)
      throw new Error('Lexora Buddy conversation branch was not found')

    let ancestors: MessageRecord[] = []
    if (branch.parent_branch_id) {
      ancestors = collectBranchMessages(conversationId, branch.parent_branch_id, visited)
      const forkIndex = ancestors.findIndex(message => message.id === branch.forked_from_message_id)
      if (forkIndex < 0)
        throw new Error('Lexora Buddy conversation fork point was not found')
      ancestors = ancestors.slice(0, forkIndex + 1)
    }
    const current = (listAllMessagesForBranch.all(
      conversationId,
      branchId,
    ) as unknown as MessageRow[]).map(toMessage)
    return [...ancestors, ...current]
  }
  const collectVisibleBranchSegments = (
    conversationId: string,
    branchId: string,
    visited = new Set<string>(),
  ): VisibleBranchSegment[] => {
    if (visited.has(branchId))
      throw new Error('Lexora Buddy conversation branch ancestry is invalid')
    visited.add(branchId)
    const branch = findBranch.get(branchId) as BranchRow | undefined
    if (!branch || branch.conversation_id !== conversationId)
      throw new Error('Lexora Buddy conversation branch was not found')
    if (!branch.parent_branch_id)
      return [{ branchId, throughMessage: null }]

    const segments = collectVisibleBranchSegments(
      conversationId,
      branch.parent_branch_id,
      visited,
    )
    const forkMessage = findMessage.get(branch.forked_from_message_id) as MessageRow | undefined
    const segmentIndex = forkMessage
      ? segments.findIndex(segment => segment.branchId === forkMessage.branch_id)
      : -1
    const segment = segmentIndex >= 0 ? segments[segmentIndex] : null
    if (
      !forkMessage
      || forkMessage.conversation_id !== conversationId
      || !segment
      || (segment.throughMessage && compareMessageOrder(forkMessage, segment.throughMessage) > 0)
    ) {
      throw new Error('Lexora Buddy conversation fork point was not found')
    }
    return [
      ...segments.slice(0, segmentIndex),
      { branchId: segment.branchId, throughMessage: forkMessage },
      { branchId, throughMessage: null },
    ]
  }

  return {
    activateBranch(input) {
      return withTransaction(database, () => {
        const conversation = findConversation.get(input.conversationId) as ConversationRow | undefined
        const branch = findBranch.get(input.branchId) as BranchRow | undefined
        if (
          !conversation
          || conversation.deleted_at !== null
          || !branch
          || branch.conversation_id !== input.conversationId
        ) {
          throw new ConversationBranchError('branch is not activatable')
        }
        if (conversation.active_branch_id === input.branchId)
          return toConversation(conversation)
        if (findIncompleteRun.get(input.conversationId))
          throw new ConversationBranchError('branch is not activatable')
        activateBranch.run(input.branchId, input.updatedAt, input.conversationId)
        return toConversation(requireRow<ConversationRow>(
          findConversation.get(input.conversationId),
          input.conversationId,
        ))
      })
    },
    create(input) {
      return withTransaction(database, () => {
        insertConversation.run(
          input.id,
          input.projectId,
          input.title,
          input.createdAt,
          input.createdAt,
          input.executionProfile,
          input.origin ?? 'interactive',
        )
        insertBranch.run(input.branchId, input.id, null, null, input.createdAt)
        activateBranch.run(input.branchId, input.createdAt, input.id)
        return toConversation(requireRow<ConversationRow>(findConversation.get(input.id), input.id))
      })
    },
    createBranch(input) {
      return withTransaction(database, () => {
        if ((input.parentBranchId === null) !== (input.forkedFromMessageId === null))
          throw new Error('Lexora Buddy conversation fork binding is invalid')
        if (input.parentBranchId && input.forkedFromMessageId) {
          const parent = findBranch.get(input.parentBranchId) as BranchRow | undefined
          if (
            !parent
            || parent.conversation_id !== input.conversationId
            || !collectBranchMessages(input.conversationId, input.parentBranchId)
              .some(message => message.id === input.forkedFromMessageId)
          ) {
            throw new Error('Lexora Buddy conversation fork binding is invalid')
          }
        }
        insertBranch.run(
          input.id,
          input.conversationId,
          input.parentBranchId,
          input.forkedFromMessageId,
          input.createdAt,
        )
        if (input.activate)
          activateBranch.run(input.id, input.createdAt, input.conversationId)
        return toBranch(requireRow<BranchRow>(findBranch.get(input.id), input.id))
      })
    },
    createMessage(input) {
      insertMessage.run(
        input.id,
        input.conversationId,
        input.branchId,
        input.runId,
        input.role,
        JSON.stringify(input.content),
        input.createdAt,
      )
      return toMessage(requireRow<MessageRow>(findMessage.get(input.id), input.id))
    },
    findById(id) {
      const row = findConversation.get(id) as ConversationRow | undefined
      return row ? toConversation(row) : null
    },
    findMessageById(id) {
      const row = findMessage.get(id) as MessageRow | undefined
      return row ? toMessage(row) : null
    },
    isDeleted(id) {
      const row = findConversation.get(id) as ConversationRow | undefined
      return row?.deleted_at !== null && row?.deleted_at !== undefined
    },
    listBranchMessages(conversationId, branchId) {
      return collectBranchMessages(conversationId, branchId)
    },
    listBranches(conversationId) {
      return (listBranches.all(conversationId) as unknown as BranchRow[]).map(toBranch)
    },
    listMessagePage(conversationId, branchId, options) {
      if (options.limit <= 0)
        return { items: [], nextBeforeMessageId: null }
      const segments = collectVisibleBranchSegments(conversationId, branchId)
      const boundary = options.beforeMessageId
        ? findMessage.get(options.beforeMessageId) as MessageRow | undefined
        : null
      let segmentIndex = segments.length - 1
      if (options.beforeMessageId) {
        segmentIndex = boundary
          ? segments.findIndex(segment => segment.branchId === boundary.branch_id)
          : -1
        const segment = segmentIndex >= 0 ? segments[segmentIndex] : null
        if (
          !boundary
          || boundary.conversation_id !== conversationId
          || !segment
          || (segment.throughMessage && compareMessageOrder(boundary, segment.throughMessage) > 0)
        ) {
          throw new ConversationBranchError('message cursor is invalid')
        }
      }
      const descending: MessageRow[] = []
      for (let index = segmentIndex; index >= 0 && descending.length <= options.limit; index -= 1) {
        const segment = segments[index]!
        const remaining = options.limit + 1 - descending.length
        const rows = boundary && index === segmentIndex
          ? listMessagesForBranchBefore.all(
            conversationId,
            segment.branchId,
            boundary.created_at,
            boundary.created_at,
            boundary.id,
            remaining,
          ) as unknown as MessageRow[]
          : segment.throughMessage
            ? listMessagesForBranchThrough.all(
              conversationId,
              segment.branchId,
              segment.throughMessage.created_at,
              segment.throughMessage.created_at,
              segment.throughMessage.id,
              remaining,
            ) as unknown as MessageRow[]
            : listNewestMessagesForBranch.all(
              conversationId,
              segment.branchId,
              remaining,
            ) as unknown as MessageRow[]
        descending.push(...rows)
      }
      const hasMore = descending.length > options.limit
      const items = descending
        .slice(0, options.limit)
        .reverse()
        .map(toMessage)
      return {
        items,
        nextBeforeMessageId: hasMore ? items[0]?.id ?? null : null,
      }
    },
    listTimelinePage(conversationId, branchId, options) {
      if (options.limit <= 0)
        return { items: [], nextBefore: null }
      const segments = collectVisibleBranchSegments(conversationId, branchId)
      const boundary = options.before
        ? resolveTimelineBoundary(options.before, findMessage, findCompactionRun)
        : null
      let segmentIndex = segments.length - 1
      if (options.before) {
        segmentIndex = boundary
          ? segments.findIndex(segment => segment.branchId === boundary.branch_id)
          : -1
        const segment = segmentIndex >= 0 ? segments[segmentIndex] : null
        if (
          !boundary
          || boundary.conversation_id !== conversationId
          || !segment
          || (segment.throughMessage && compareTimelineOrder(
            boundary,
            toMessageTimelineBoundary(segment.throughMessage),
          ) > 0)
        ) {
          throw new ConversationBranchError('timeline cursor is invalid')
        }
      }
      const descending: ConversationTimelineRow[] = []
      for (let index = segmentIndex; index >= 0 && descending.length <= options.limit; index -= 1) {
        const segment = segments[index]!
        const remaining = options.limit + 1 - descending.length
        const common = [
          conversationId,
          segment.branchId,
          conversationId,
          segment.branchId,
        ] as const
        const rows = boundary && index === segmentIndex
          ? listTimelineForBranchBefore.all(
            ...common,
            boundary.occurred_at,
            boundary.occurred_at,
            boundary.sort_rank,
            boundary.sort_rank,
            boundary.id,
            remaining,
          ) as unknown as ConversationTimelineRow[]
          : segment.throughMessage
            ? listTimelineForBranchThrough.all(
              ...common,
              segment.throughMessage.created_at,
              segment.throughMessage.created_at,
              0,
              0,
              segment.throughMessage.id,
              remaining,
            ) as unknown as ConversationTimelineRow[]
            : listNewestTimelineForBranch.all(
              ...common,
              remaining,
            ) as unknown as ConversationTimelineRow[]
        descending.push(...rows)
      }
      const hasMore = descending.length > options.limit
      const selected = descending.slice(0, options.limit).reverse()
      return {
        items: selected.map(toTimelineItem),
        nextBefore: hasMore && selected[0]
          ? toTimelineBoundary(selected[0])
          : null,
      }
    },
    listMessages(conversationId, branchId, limit = 500) {
      if (limit <= 0)
        return []
      return collectBranchMessages(conversationId, branchId).slice(-limit)
    },
    listRecent(limit = 100) {
      return (listRecent.all(limit) as unknown as ConversationSummaryRow[])
        .map(toConversationSummary)
    },
    markDeleted(id, deletedAt) {
      return Number(markDeleted.run(deletedAt, deletedAt, id).changes) === 1
    },
    rename(input) {
      if (Number(renameConversation.run(input.title, input.updatedAt, input.id).changes) !== 1)
        throw new ConversationBranchError('cannot be renamed')
      return toConversation(requireRow<ConversationRow>(findConversation.get(input.id), input.id))
    },
    setExecutionProfile(input) {
      return withTransaction(database, () => {
        const current = findConversation.get(input.id) as ConversationRow | undefined
        if (!current || current.deleted_at !== null)
          return null
        if (current.execution_profile === input.executionProfile)
          return toConversation(current)
        if (Number(setExecutionProfile.run(
          input.executionProfile,
          input.updatedAt,
          input.id,
        ).changes) !== 1) {
          return null
        }
        return toConversation(requireRow<ConversationRow>(findConversation.get(input.id), input.id))
      })
    },
    setModelSelection(input) {
      if (Number(setModelSelection.run(
        JSON.stringify(input.modelSelection),
        input.updatedAt,
        input.id,
      ).changes) !== 1) {
        return null
      }
      return toConversation(requireRow<ConversationRow>(findConversation.get(input.id), input.id))
    },
  }
}

export class ConversationBranchError extends Error {
  readonly code = 'VALIDATION_FAILED'

  constructor(reason: string) {
    super(`Lexora Buddy conversation ${reason}`)
    this.name = 'ConversationBranchError'
  }
}

function requireRow<T>(value: unknown, id: string): T {
  if (!value)
    throw new Error(`Lexora Buddy storage row was not persisted: ${id}`)
  return value as T
}

function toConversation(row: ConversationRow): ConversationRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    activeBranchId: row.active_branch_id,
    createdAt: row.created_at,
    executionProfile: row.execution_profile,
    modelSelection: row.model_selection_json
      ? JSON.parse(row.model_selection_json) as ConversationModelSelection
      : null,
    origin: row.origin,
    deletedAt: row.deleted_at,
    updatedAt: row.updated_at,
  }
}

function toConversationSummary(row: ConversationSummaryRow): ConversationSummaryRecord {
  return {
    ...toConversation(row),
    activity: row.activity,
    automationOccurrence: row.automation_occurrence_id
      && row.automation_id
      && row.automation_scheduled_for
      ? {
          automationId: row.automation_id,
          occurrenceId: row.automation_occurrence_id,
          scheduledFor: row.automation_scheduled_for,
        }
      : null,
  }
}

function toBranch(row: BranchRow): ConversationBranchRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    parentBranchId: row.parent_branch_id,
    forkedFromMessageId: row.forked_from_message_id,
    createdAt: row.created_at,
  }
}

function toMessage(row: MessageRow): MessageRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    branchId: row.branch_id,
    runId: row.run_id,
    role: row.role,
    content: JSON.parse(row.content_json),
    createdAt: row.created_at,
  }
}

function compareMessageOrder(left: MessageRow, right: MessageRow): number {
  return left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id)
}

function resolveTimelineBoundary(
  boundary: ConversationTimelineBoundaryRecord,
  findMessage: ReturnType<DatabaseSync['prepare']>,
  findCompactionRun: ReturnType<DatabaseSync['prepare']>,
): ConversationTimelineRow | null {
  if (boundary.kind === 'message') {
    const message = findMessage.get(boundary.id) as MessageRow | undefined
    if (
      !message
      || message.branch_id !== boundary.branchId
      || message.created_at !== boundary.occurredAt
    ) {
      return null
    }
    return toMessageTimelineBoundary(message)
  }
  const run = findCompactionRun.get(boundary.id) as {
    id: string
    conversation_id: string
    branch_id: string
    started_at: string
  } | undefined
  if (
    !run
    || run.branch_id !== boundary.branchId
    || run.started_at !== boundary.occurredAt
  ) {
    return null
  }
  return {
    branch_id: run.branch_id,
    compaction_payload_json: null,
    completed_at: null,
    content_json: null,
    conversation_id: run.conversation_id,
    error_code: null,
    id: run.id,
    kind: 'compaction',
    occurred_at: run.started_at,
    role: null,
    run_id: run.id,
    sort_rank: 1,
    status: null,
  }
}

function toMessageTimelineBoundary(message: MessageRow): ConversationTimelineRow {
  return {
    branch_id: message.branch_id,
    compaction_payload_json: null,
    completed_at: null,
    content_json: message.content_json,
    conversation_id: message.conversation_id,
    error_code: null,
    id: message.id,
    kind: 'message',
    occurred_at: message.created_at,
    role: message.role,
    run_id: message.run_id,
    sort_rank: 0,
    status: null,
  }
}

function compareTimelineOrder(
  left: Pick<ConversationTimelineRow, 'id' | 'occurred_at' | 'sort_rank'>,
  right: Pick<ConversationTimelineRow, 'id' | 'occurred_at' | 'sort_rank'>,
): number {
  return left.occurred_at.localeCompare(right.occurred_at)
    || left.sort_rank - right.sort_rank
    || left.id.localeCompare(right.id)
}

function toTimelineItem(row: ConversationTimelineRow): ConversationTimelineItemRecord {
  if (row.kind === 'message') {
    if (!row.role || row.content_json === null)
      throw new Error(`Lexora Buddy timeline message is invalid: ${row.id}`)
    return {
      branchId: row.branch_id,
      content: JSON.parse(row.content_json),
      conversationId: row.conversation_id,
      createdAt: row.occurred_at,
      id: row.id,
      kind: 'message',
      role: row.role,
      runId: row.run_id,
    }
  }
  if (!row.status)
    throw new Error(`Lexora Buddy timeline compaction is invalid: ${row.id}`)
  const payload = parseCompactionPayload(row.compaction_payload_json)
  return {
    branchId: row.branch_id,
    completedAt: row.completed_at,
    conversationId: row.conversation_id,
    createdAt: row.occurred_at,
    errorCode: row.error_code,
    estimatedTokensAfter: readNonNegativeInteger(payload?.estimatedTokensAfter),
    id: row.id,
    kind: 'compaction',
    status: row.status,
    tokensBefore: readNonNegativeInteger(payload?.tokensBefore),
  }
}

function toTimelineBoundary(row: ConversationTimelineRow): ConversationTimelineBoundaryRecord {
  return {
    branchId: row.branch_id,
    id: row.id,
    kind: row.kind,
    occurredAt: row.occurred_at,
  }
}

function parseCompactionPayload(value: string | null): Record<string, unknown> | null {
  if (!value)
    return null
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  }
  catch {
    return null
  }
}

function readNonNegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null
}
