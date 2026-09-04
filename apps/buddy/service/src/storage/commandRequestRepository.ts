import type { DatabaseSync } from 'node:sqlite'
import type { BuddyApprovalPolicy } from '../../../shared/approvalPolicy'
import type { BuddyExecutionProfile } from '../../../shared/executionProfile'
import { withTransaction } from './database'

export type BuddyActionCommandName = 'compact'

export interface PrepareCommandRequestInput {
  approvalPolicy: BuddyApprovalPolicy
  arguments: string
  branchId: string
  command: BuddyActionCommandName
  conversationId: string
  createdAt: string
  executionProfile: BuddyExecutionProfile
  requestFingerprint: string
  requestId: string
  runId: string
}

export interface RetryInterruptedCommandRequestInput {
  createdAt: string
  requestId: string
  runId: string
}

export interface CommandRequestRecord {
  arguments: string
  branchId: string
  command: BuddyActionCommandName
  conversationId: string
  created: boolean
  requestFingerprint: string
  requestId: string
  runId: string
}

export interface CommandRequestRepository {
  findByRunId: (runId: string) => CommandRequestRecord | null
  findByRequestId: (requestId: string) => CommandRequestRecord | null
  prepare: (input: PrepareCommandRequestInput) => CommandRequestRecord
  retryInterrupted: (input: RetryInterruptedCommandRequestInput) => CommandRequestRecord
}

interface CommandRequestRow {
  arguments: string
  branch_id: string
  command: BuddyActionCommandName
  conversation_id: string
  request_fingerprint: string
  request_id: string
  run_id: string
}

interface ConversationRow {
  active_branch_id: string | null
  approval_policy: BuddyApprovalPolicy
  deleted_at: string | null
  execution_profile: BuddyExecutionProfile
}

interface SourceRunRow {
  approval_policy: BuddyApprovalPolicy
  branch_id: string
  conversation_id: string
  error_code: string | null
  execution_profile: BuddyExecutionProfile
  model: string
  context_window: number | null
  max_tokens: number | null
  pi_session_file: string | null
  provider: string
  status: string
  triggering_message_id: string
}

export function createCommandRequestRepository(database: DatabaseSync): CommandRequestRepository {
  const findRequest = database.prepare('SELECT * FROM command_requests WHERE request_id = ?')
  const findRequestByRun = database.prepare('SELECT * FROM command_requests WHERE run_id = ?')
  const findConversation = database.prepare(`
    SELECT active_branch_id, approval_policy, deleted_at, execution_profile
    FROM conversations WHERE id = ?
  `)
  const findIncompleteRun = database.prepare(`
    SELECT 1 FROM runs
    WHERE conversation_id = ? AND status IN ('queued', 'running')
    LIMIT 1
  `)
  const findSourceRun = database.prepare(`
    SELECT * FROM runs
    WHERE conversation_id = ? AND branch_id = ?
      AND pi_session_file IS NOT NULL
      AND status IN ('completed', 'failed', 'cancelled')
    ORDER BY started_at DESC, id DESC
    LIMIT 1
  `)
  const findRun = database.prepare('SELECT * FROM runs WHERE id = ?')
  const insertRun = database.prepare(`
    INSERT INTO runs (
      id, conversation_id, branch_id, triggering_message_id, provider, model,
      context_window, max_tokens, purpose, status, pi_session_file, error_code,
      started_at, completed_at, approval_policy, execution_profile
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'conversation.compaction', 'queued', ?, NULL, ?, NULL, ?, ?)
  `)
  const insertRequest = database.prepare(`
    INSERT INTO command_requests (
      request_id, request_fingerprint, conversation_id, branch_id,
      run_id, command, arguments, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const updateRequestRun = database.prepare(`
    UPDATE command_requests SET run_id = ? WHERE request_id = ? AND run_id = ?
  `)

  const findByRequestId = (requestId: string): CommandRequestRecord | null => {
    const row = findRequest.get(requestId) as CommandRequestRow | undefined
    return row ? toRecord(row, false) : null
  }

  return {
    findByRunId(runId) {
      const row = findRequestByRun.get(runId) as CommandRequestRow | undefined
      return row ? toRecord(row, false) : null
    },
    findByRequestId,
    prepare(input) {
      return withTransaction(database, () => {
        const existing = findRequest.get(input.requestId) as CommandRequestRow | undefined
        if (existing) {
          if (existing.request_fingerprint !== input.requestFingerprint)
            throw new CommandRequestConflictError()
          return toRecord(existing, false)
        }
        const conversation = findConversation.get(input.conversationId) as ConversationRow | undefined
        if (
          !conversation
          || conversation.active_branch_id !== input.branchId
          || conversation.approval_policy !== input.approvalPolicy
          || conversation.execution_profile !== input.executionProfile
          || conversation.deleted_at !== null
          || findIncompleteRun.get(input.conversationId)
        ) {
          throw new CommandRequestConflictError()
        }
        const source = findSourceRun.get(
          input.conversationId,
          input.branchId,
        ) as SourceRunRow | undefined
        if (!source?.pi_session_file)
          throw new CommandRequestConflictError()

        insertCompactionRun(
          insertRun,
          input.runId,
          input.createdAt,
          source,
          input.approvalPolicy,
          input.executionProfile,
        )
        insertRequest.run(
          input.requestId,
          input.requestFingerprint,
          input.conversationId,
          input.branchId,
          input.runId,
          input.command,
          input.arguments,
          input.createdAt,
        )
        return {
          ...input,
          created: true,
        }
      })
    },
    retryInterrupted(input) {
      return withTransaction(database, () => {
        const request = findRequest.get(input.requestId) as CommandRequestRow | undefined
        if (!request)
          throw new CommandRequestConflictError()
        const previous = findRun.get(request.run_id) as SourceRunRow | undefined
        if (!previous)
          throw new CommandRequestConflictError()
        if (previous.status !== 'failed' || previous.error_code !== 'RUNTIME_RESTARTED')
          return toRecord(request, false)
        const conversation = findConversation.get(request.conversation_id) as ConversationRow | undefined
        if (
          !conversation
          || conversation.active_branch_id !== request.branch_id
          || conversation.deleted_at !== null
          || findIncompleteRun.get(request.conversation_id)
          || !previous.pi_session_file
        ) {
          throw new CommandRequestConflictError()
        }

        insertCompactionRun(
          insertRun,
          input.runId,
          input.createdAt,
          previous,
          previous.approval_policy,
          previous.execution_profile,
        )
        if (Number(updateRequestRun.run(input.runId, input.requestId, request.run_id).changes) !== 1)
          throw new CommandRequestConflictError()
        return {
          ...toRecord(request, true),
          runId: input.runId,
        }
      })
    },
  }
}

export class CommandRequestConflictError extends Error {
  readonly code = 'VALIDATION_FAILED'

  constructor() {
    super('Lexora Buddy command request conflicts with the current conversation state')
    this.name = 'CommandRequestConflictError'
  }
}

function insertCompactionRun(
  statement: ReturnType<DatabaseSync['prepare']>,
  runId: string,
  createdAt: string,
  source: SourceRunRow,
  approvalPolicy: BuddyApprovalPolicy,
  executionProfile: BuddyExecutionProfile,
): void {
  statement.run(
    runId,
    source.conversation_id,
    source.branch_id,
    source.triggering_message_id,
    source.provider,
    source.model,
    source.context_window,
    source.max_tokens,
    source.pi_session_file,
    createdAt,
    approvalPolicy,
    executionProfile,
  )
}

function toRecord(row: CommandRequestRow, created: boolean): CommandRequestRecord {
  return {
    arguments: row.arguments,
    branchId: row.branch_id,
    command: row.command,
    conversationId: row.conversation_id,
    created,
    requestFingerprint: row.request_fingerprint,
    requestId: row.request_id,
    runId: row.run_id,
  }
}
