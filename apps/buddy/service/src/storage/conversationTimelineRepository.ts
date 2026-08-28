import type { DatabaseSync } from 'node:sqlite'
import type {
  ConversationBranchLineage,
  MessageRecord,
  MessageRole,
  VisibleConversationBranchSegment,
} from './conversationHistoryRepository'
import type { RunStatus } from './runRecord'

export interface ConversationTimelineMessageRecord extends MessageRecord {
  kind: 'message'
}

export interface ConversationTimelineCompactionRecord {
  kind: 'compaction'
  id: string
  conversationId: string
  branchId: string
  status: RunStatus
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

export interface ConversationTimelineRepository {
  listTimelinePage: (
    conversationId: string,
    branchId: string,
    options: ListConversationTimelinePageOptions,
  ) => ConversationTimelinePageRecord
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

interface ConversationTimelineRow {
  kind: 'message' | 'compaction'
  id: string
  conversation_id: string
  branch_id: string
  run_id: string | null
  role: MessageRole | null
  content_json: string | null
  status: RunStatus | null
  error_code: string | null
  completed_at: string | null
  compaction_payload_json: string | null
  occurred_at: string
  sort_rank: number
}

export function createConversationTimelineRepository(
  database: DatabaseSync,
  branches: ConversationBranchLineage,
): ConversationTimelineRepository {
  const findMessage = database.prepare('SELECT * FROM messages WHERE id = ?')
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

  return {
    listTimelinePage(conversationId, branchId, options) {
      if (options.limit <= 0)
        return { items: [], nextBefore: null }
      const segments = branches.listVisibleSegments(conversationId, branchId)
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
          throw new ConversationTimelineRepositoryError()
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
              segment.throughMessage.createdAt,
              segment.throughMessage.createdAt,
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
  }
}

class ConversationTimelineRepositoryError extends Error {
  readonly code = 'VALIDATION_FAILED'

  constructor() {
    super('Lexora Buddy conversation timeline cursor is invalid')
    this.name = 'ConversationTimelineRepositoryError'
  }
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
    return toMessageTimelineRow(message)
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

function toMessageTimelineRow(message: MessageRow): ConversationTimelineRow {
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

function toMessageTimelineBoundary(
  message: NonNullable<VisibleConversationBranchSegment['throughMessage']>,
): Pick<ConversationTimelineRow, 'id' | 'occurred_at' | 'sort_rank'> {
  return {
    id: message.id,
    occurred_at: message.createdAt,
    sort_rank: 0,
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
