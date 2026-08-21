import type { DatabaseSync } from 'node:sqlite'

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface RunRecord {
  id: string
  conversationId: string
  branchId: string
  triggeringMessageId: string
  provider: string
  model: string
  contextWindow: number | null
  maxTokens: number | null
  purpose: string
  status: RunStatus
  piSessionFile: string | null
  errorCode: string | null
  startedAt: string
  completedAt: string | null
}

export interface CreateRunInput extends Omit<
  RunRecord,
  'completedAt' | 'contextWindow' | 'errorCode' | 'maxTokens'
> {
  completedAt?: string | null
  contextWindow?: number | null
  errorCode?: string | null
  maxTokens?: number | null
}

export interface RunRepository {
  bindSession: (id: string, piSessionFile: string) => boolean
  clearSessionBindings: (
    conversationId: string,
    branchId: string,
    piSessionFile: string,
  ) => number
  create: (input: CreateRunInput) => RunRecord
  findById: (id: string) => RunRecord | null
  findLatestForBranch: (conversationId: string, branchId: string) => RunRecord | null
  listIncomplete: () => RunRecord[]
  listRecent: (limit?: number) => RunRecord[]
  listForConversation: (conversationId: string, limit?: number) => RunRecord[]
  listForTimeline: (
    conversationId: string,
    activeBranchId: string,
    triggeringMessageIds: readonly string[],
    runIds: readonly string[],
  ) => RunRecord[]
  listIdsForConversation: (conversationId: string) => string[]
  updateStatus: (
    id: string,
    status: RunStatus,
    completedAt?: string | null,
    errorCode?: string | null,
  ) => boolean
}

interface RunRow {
  id: string
  conversation_id: string
  branch_id: string
  triggering_message_id: string
  provider: string
  model: string
  context_window: number | null
  max_tokens: number | null
  purpose: string
  status: RunStatus
  pi_session_file: string | null
  error_code: string | null
  started_at: string
  completed_at: string | null
}

export function createRunRepository(database: DatabaseSync): RunRepository {
  const find = database.prepare('SELECT * FROM runs WHERE id = ?')
  const insert = database.prepare(`
    INSERT INTO runs (
      id, conversation_id, branch_id, triggering_message_id, provider, model,
      context_window, max_tokens, purpose, status, pi_session_file, error_code,
      started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const list = database.prepare(`
    SELECT * FROM runs
    WHERE conversation_id = ?
    ORDER BY started_at DESC, id DESC
    LIMIT ?
  `)
  const listIds = database.prepare(`
    SELECT id FROM runs WHERE conversation_id = ? ORDER BY started_at, id
  `)
  const listIncomplete = database.prepare(`
    SELECT * FROM runs WHERE status IN ('queued', 'running') ORDER BY started_at, id
  `)
  const listRecent = database.prepare(`
    SELECT * FROM runs ORDER BY started_at DESC, id DESC LIMIT ?
  `)
  const findLatestForBranch = database.prepare(`
    SELECT * FROM runs
    WHERE conversation_id = ? AND branch_id = ? AND pi_session_file IS NOT NULL
    ORDER BY started_at DESC, id DESC
    LIMIT 1
  `)
  const update = database.prepare(`
    UPDATE runs SET status = ?, completed_at = ?, error_code = ? WHERE id = ?
  `)
  const bindSession = database.prepare(`
    UPDATE runs SET pi_session_file = ? WHERE id = ?
  `)
  const clearSessionBindings = database.prepare(`
    UPDATE runs SET pi_session_file = NULL
    WHERE conversation_id = ? AND branch_id = ? AND pi_session_file = ?
  `)

  return {
    bindSession(id, piSessionFile) {
      return Number(bindSession.run(piSessionFile, id).changes) === 1
    },
    clearSessionBindings(conversationId, branchId, piSessionFile) {
      return Number(clearSessionBindings.run(
        conversationId,
        branchId,
        piSessionFile,
      ).changes)
    },
    create(input) {
      insert.run(
        input.id,
        input.conversationId,
        input.branchId,
        input.triggeringMessageId,
        input.provider,
        input.model,
        input.contextWindow ?? null,
        input.maxTokens ?? null,
        input.purpose,
        input.status,
        input.piSessionFile,
        input.errorCode ?? null,
        input.startedAt,
        input.completedAt ?? null,
      )
      return requireRun(find.get(input.id), input.id)
    },
    findById(id) {
      const row = find.get(id) as RunRow | undefined
      return row ? toRun(row) : null
    },
    findLatestForBranch(conversationId, branchId) {
      const row = findLatestForBranch.get(conversationId, branchId) as RunRow | undefined
      return row ? toRun(row) : null
    },
    listForConversation(conversationId, limit = 100) {
      return (list.all(conversationId, limit) as unknown as RunRow[]).map(toRun)
    },
    listForTimeline(conversationId, activeBranchId, triggeringMessageIds, runIds) {
      const clauses: string[] = []
      const parameters: Array<string> = [conversationId]
      if (runIds.length > 0) {
        clauses.push(`id IN (${runIds.map(() => '?').join(', ')})`)
        parameters.push(...runIds)
      }
      if (triggeringMessageIds.length > 0) {
        clauses.push(`(
          branch_id = ?
          AND triggering_message_id IN (${triggeringMessageIds.map(() => '?').join(', ')})
        )`)
        parameters.push(activeBranchId, ...triggeringMessageIds)
      }
      if (clauses.length === 0)
        return []
      const rows = database.prepare(`
        SELECT * FROM runs
        WHERE conversation_id = ? AND (${clauses.join(' OR ')})
        ORDER BY started_at, id
      `).all(...parameters) as unknown as RunRow[]
      return rows.map(toRun)
    },
    listIdsForConversation(conversationId) {
      return (listIds.all(conversationId) as unknown as Array<{ id: string }>).map(row => row.id)
    },
    listIncomplete() {
      return (listIncomplete.all() as unknown as RunRow[]).map(toRun)
    },
    listRecent(limit = 100) {
      return (listRecent.all(limit) as unknown as RunRow[]).map(toRun)
    },
    updateStatus(id, status, completedAt = null, errorCode = null) {
      return Number(update.run(status, completedAt, errorCode, id).changes) === 1
    },
  }
}

function requireRun(value: unknown, id: string): RunRecord {
  const row = value as RunRow | undefined
  if (!row)
    throw new Error(`Lexora Buddy run was not persisted: ${id}`)
  return toRun(row)
}

function toRun(row: RunRow): RunRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    branchId: row.branch_id,
    triggeringMessageId: row.triggering_message_id,
    provider: row.provider,
    model: row.model,
    contextWindow: row.context_window,
    maxTokens: row.max_tokens,
    purpose: row.purpose,
    status: row.status,
    piSessionFile: row.pi_session_file,
    errorCode: row.error_code,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }
}
