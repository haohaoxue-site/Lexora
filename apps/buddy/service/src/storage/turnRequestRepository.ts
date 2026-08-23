import type { DatabaseSync } from 'node:sqlite'
import type { BuddyExecutionProfile } from '../../../shared/executionProfile'
import type { BuddyServiceTier } from '../../../shared/modelSelection'
import type { RunInputContextItem } from './runInputRepository'
import { withTransaction } from './database'

export interface PrepareTurnRequestInput {
  branchId: string
  conversationId: string
  createdAt: string
  executionProfile: BuddyExecutionProfile
  model: string
  modelParameters?: { contextWindow: number, maxTokens: number }
  projectId: string | null
  provider: string
  requestFingerprint: string
  requestId: string
  runInput: {
    attachmentIds: readonly string[]
    contextItems: readonly RunInputContextItem[]
    prompt: string
    reasoning: string | null
    serviceTier: BuddyServiceTier | null
  }
  runId: string
  title: string | null
  userMessageContent: unknown
  userMessageId: string
}

export interface TurnRequestRecord {
  branchId: string
  conversationId: string
  created: boolean
  requestFingerprint: string
  requestId: string
  runId: string
}

export interface RetryInterruptedTurnRequestInput {
  createdAt: string
  requestId: string
  runId: string
}

export interface RegenerateTurnRequestInput {
  branchId: string
  conversationId: string
  createdAt: string
  executionProfile: BuddyExecutionProfile
  forkedFromMessageId: string
  parentBranchId: string
  requestFingerprint: string
  requestId: string
  runId: string
  sourceRunId: string
}

export interface EditTurnRequestInput extends PrepareTurnRequestInput {
  forkedFromMessageId: string | null
  parentBranchId: string
  sourceUserMessageId: string
}

interface TurnRequestRow {
  branch_id: string
  conversation_id: string
  created_at: string
  request_fingerprint: string
  request_id: string
  run_id: string
}

interface ConversationBindingRow {
  active_branch_id: string | null
  execution_profile: BuddyExecutionProfile
  project_id: string | null
}

interface RetryRunRow {
  branch_id: string
  conversation_id: string
  error_code: string | null
  execution_profile: BuddyExecutionProfile
  model: string
  context_window: number | null
  max_tokens: number | null
  provider: string
  purpose: string
  status: string
  triggering_message_id: string
}

interface MessageBindingRow {
  conversation_id: string
  role: string
}

export interface TurnRequestRepository {
  edit: (input: EditTurnRequestInput) => TurnRequestRecord
  findByRequestId: (requestId: string) => TurnRequestRecord | null
  prepare: (input: PrepareTurnRequestInput) => TurnRequestRecord
  regenerate: (input: RegenerateTurnRequestInput) => TurnRequestRecord
  retryInterrupted: (input: RetryInterruptedTurnRequestInput) => TurnRequestRecord
}

export function createTurnRequestRepository(database: DatabaseSync): TurnRequestRepository {
  const findRequest = database.prepare('SELECT * FROM turn_requests WHERE request_id = ?')
  const findConversation = database.prepare(`
    SELECT project_id, active_branch_id, execution_profile FROM conversations WHERE id = ?
  `)
  const findConversationDeletion = database.prepare(`
    SELECT 1 FROM conversation_deletions WHERE conversation_id = ?
  `)
  const insertConversation = database.prepare(`
    INSERT INTO conversations (
      id, project_id, title, active_branch_id, created_at, updated_at, execution_profile
    ) VALUES (?, ?, ?, NULL, ?, ?, ?)
  `)
  const insertBranch = database.prepare(`
    INSERT INTO conversation_branches (
      id, conversation_id, parent_branch_id, forked_from_message_id, created_at
    ) VALUES (?, ?, NULL, NULL, ?)
  `)
  const insertForkBranch = database.prepare(`
    INSERT INTO conversation_branches (
      id, conversation_id, parent_branch_id, forked_from_message_id, created_at
    ) VALUES (?, ?, ?, ?, ?)
  `)
  const activateBranch = database.prepare(`
    UPDATE conversations SET active_branch_id = ?, updated_at = ? WHERE id = ?
  `)
  const attach = database.prepare(`
    UPDATE attachments SET conversation_id = ?, draft_key = NULL, status = 'attached'
    WHERE id = ? AND (
      status = 'draft' OR (status = 'attached' AND conversation_id = ?)
    )
  `)
  const insertMessage = database.prepare(`
    INSERT INTO messages (
      id, conversation_id, branch_id, run_id, role, content_json, created_at
    ) VALUES (?, ?, ?, NULL, 'user', ?, ?)
  `)
  const findPreviousSession = database.prepare(`
    SELECT pi_session_file FROM runs
    WHERE conversation_id = ? AND branch_id = ? AND pi_session_file IS NOT NULL
    ORDER BY started_at DESC, id DESC
    LIMIT 1
  `)
  const insertRun = database.prepare(`
    INSERT INTO runs (
      id, conversation_id, branch_id, triggering_message_id, provider, model,
      context_window, max_tokens, purpose, status, pi_session_file, error_code,
      started_at, completed_at, execution_profile
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'chat', 'queued', ?, NULL, ?, NULL, ?)
  `)
  const insertRunInput = database.prepare(`
    INSERT INTO run_inputs (
      run_id, prompt, attachment_ids_json, context_items_json,
      reasoning, service_tier, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const insertRequest = database.prepare(`
    INSERT INTO turn_requests (
      request_id, request_fingerprint, conversation_id, branch_id, run_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `)
  const findRun = database.prepare('SELECT * FROM runs WHERE id = ?')
  const findMessage = database.prepare(`
    SELECT conversation_id, role FROM messages WHERE id = ?
  `)
  const findIncompleteRun = database.prepare(`
    SELECT 1 FROM runs
    WHERE conversation_id = ? AND status IN ('queued', 'running')
    LIMIT 1
  `)
  const findPreviousCompletedSession = database.prepare(`
    SELECT pi_session_file FROM runs
    WHERE conversation_id = ? AND branch_id = ?
      AND status = 'completed' AND pi_session_file IS NOT NULL
    ORDER BY started_at DESC, id DESC
    LIMIT 1
  `)
  const updateRequestRun = database.prepare(`
    UPDATE turn_requests SET run_id = ? WHERE request_id = ? AND run_id = ?
  `)
  const cloneRunInput = database.prepare(`
    INSERT INTO run_inputs (
      run_id, prompt, attachment_ids_json, context_items_json,
      reasoning, service_tier, created_at
    )
    SELECT ?, prompt, attachment_ids_json, context_items_json,
      reasoning, service_tier, ?
    FROM run_inputs WHERE run_id = ?
  `)

  const findByRequestId = (requestId: string): TurnRequestRecord | null => {
    const row = findRequest.get(requestId) as TurnRequestRow | undefined
    return row ? toRecord(row, false) : null
  }

  return {
    edit(input) {
      return withTransaction(database, () => {
        const existing = findRequest.get(input.requestId) as TurnRequestRow | undefined
        if (existing) {
          if (existing.request_fingerprint !== input.requestFingerprint)
            throw new TurnRequestConflictError()
          return toRecord(existing, false)
        }
        const conversation = findConversation.get(input.conversationId) as ConversationBindingRow | undefined
        const sourceMessage = findMessage.get(input.sourceUserMessageId) as MessageBindingRow | undefined
        const forkMessage = input.forkedFromMessageId
          ? findMessage.get(input.forkedFromMessageId) as MessageBindingRow | undefined
          : null
        if (
          !conversation
          || conversation.project_id !== input.projectId
          || conversation.active_branch_id !== input.parentBranchId
          || conversation.execution_profile !== input.executionProfile
          || findConversationDeletion.get(input.conversationId)
          || findIncompleteRun.get(input.conversationId)
          || !sourceMessage
          || sourceMessage.conversation_id !== input.conversationId
          || sourceMessage.role !== 'user'
          || (input.forkedFromMessageId && forkMessage?.conversation_id !== input.conversationId)
        ) {
          throw new TurnRequestConflictError()
        }

        insertForkBranch.run(
          input.branchId,
          input.conversationId,
          input.forkedFromMessageId ? input.parentBranchId : null,
          input.forkedFromMessageId,
          input.createdAt,
        )
        activateBranch.run(input.branchId, input.createdAt, input.conversationId)

        for (const attachmentId of input.runInput.attachmentIds) {
          if (Number(attach.run(
            input.conversationId,
            attachmentId,
            input.conversationId,
          ).changes) !== 1) {
            throw new TurnRequestAttachmentError()
          }
        }

        insertMessage.run(
          input.userMessageId,
          input.conversationId,
          input.branchId,
          JSON.stringify(input.userMessageContent),
          input.createdAt,
        )
        insertRun.run(
          input.runId,
          input.conversationId,
          input.branchId,
          input.userMessageId,
          input.provider,
          input.model,
          input.modelParameters?.contextWindow ?? null,
          input.modelParameters?.maxTokens ?? null,
          null,
          input.createdAt,
          input.executionProfile,
        )
        insertRunInput.run(
          input.runId,
          input.runInput.prompt,
          JSON.stringify(input.runInput.attachmentIds),
          JSON.stringify(input.runInput.contextItems),
          input.runInput.reasoning,
          input.runInput.serviceTier,
          input.createdAt,
        )
        insertRequest.run(
          input.requestId,
          input.requestFingerprint,
          input.conversationId,
          input.branchId,
          input.runId,
          input.createdAt,
        )
        return {
          branchId: input.branchId,
          conversationId: input.conversationId,
          created: true,
          requestFingerprint: input.requestFingerprint,
          requestId: input.requestId,
          runId: input.runId,
        }
      })
    },
    findByRequestId,
    prepare(input) {
      return withTransaction(database, () => {
        const existing = findRequest.get(input.requestId) as TurnRequestRow | undefined
        if (existing) {
          if (existing.request_fingerprint !== input.requestFingerprint)
            throw new TurnRequestConflictError()
          return toRecord(existing, false)
        }
        if (findConversationDeletion.get(input.conversationId))
          throw new TurnRequestConflictError()

        const conversation = findConversation.get(input.conversationId) as ConversationBindingRow | undefined
        if (conversation) {
          if (
            conversation.project_id !== input.projectId
            || conversation.active_branch_id !== input.branchId
            || conversation.execution_profile !== input.executionProfile
          ) {
            throw new TurnRequestConflictError()
          }
        }
        else {
          insertConversation.run(
            input.conversationId,
            input.projectId,
            input.title,
            input.createdAt,
            input.createdAt,
            input.executionProfile,
          )
          insertBranch.run(input.branchId, input.conversationId, input.createdAt)
          activateBranch.run(input.branchId, input.createdAt, input.conversationId)
        }

        for (const attachmentId of input.runInput.attachmentIds) {
          if (Number(attach.run(
            input.conversationId,
            attachmentId,
            input.conversationId,
          ).changes) !== 1) {
            throw new TurnRequestAttachmentError()
          }
        }

        const previous = findPreviousSession.get(
          input.conversationId,
          input.branchId,
        ) as { pi_session_file: string } | undefined
        insertMessage.run(
          input.userMessageId,
          input.conversationId,
          input.branchId,
          JSON.stringify(input.userMessageContent),
          input.createdAt,
        )
        insertRun.run(
          input.runId,
          input.conversationId,
          input.branchId,
          input.userMessageId,
          input.provider,
          input.model,
          input.modelParameters?.contextWindow ?? null,
          input.modelParameters?.maxTokens ?? null,
          previous?.pi_session_file ?? null,
          input.createdAt,
          input.executionProfile,
        )
        insertRunInput.run(
          input.runId,
          input.runInput.prompt,
          JSON.stringify(input.runInput.attachmentIds),
          JSON.stringify(input.runInput.contextItems),
          input.runInput.reasoning,
          input.runInput.serviceTier,
          input.createdAt,
        )
        insertRequest.run(
          input.requestId,
          input.requestFingerprint,
          input.conversationId,
          input.branchId,
          input.runId,
          input.createdAt,
        )
        return {
          branchId: input.branchId,
          conversationId: input.conversationId,
          created: true,
          requestFingerprint: input.requestFingerprint,
          requestId: input.requestId,
          runId: input.runId,
        }
      })
    },
    regenerate(input) {
      return withTransaction(database, () => {
        const existing = findRequest.get(input.requestId) as TurnRequestRow | undefined
        if (existing) {
          if (existing.request_fingerprint !== input.requestFingerprint)
            throw new TurnRequestConflictError()
          return toRecord(existing, false)
        }
        const conversation = findConversation.get(input.conversationId) as ConversationBindingRow | undefined
        const sourceRun = findRun.get(input.sourceRunId) as RetryRunRow | undefined
        if (
          !conversation
          || conversation.active_branch_id !== input.parentBranchId
          || conversation.execution_profile !== input.executionProfile
          || findConversationDeletion.get(input.conversationId)
          || findIncompleteRun.get(input.conversationId)
          || !sourceRun
          || sourceRun.conversation_id !== input.conversationId
          || sourceRun.triggering_message_id !== input.forkedFromMessageId
          || !new Set(['completed', 'failed', 'cancelled']).has(sourceRun.status)
        ) {
          throw new TurnRequestConflictError()
        }

        insertForkBranch.run(
          input.branchId,
          input.conversationId,
          input.parentBranchId,
          input.forkedFromMessageId,
          input.createdAt,
        )
        activateBranch.run(input.branchId, input.createdAt, input.conversationId)
        insertRun.run(
          input.runId,
          input.conversationId,
          input.branchId,
          input.forkedFromMessageId,
          sourceRun.provider,
          sourceRun.model,
          sourceRun.context_window,
          sourceRun.max_tokens,
          null,
          input.createdAt,
          input.executionProfile,
        )
        if (Number(cloneRunInput.run(input.runId, input.createdAt, input.sourceRunId).changes) !== 1)
          throw new TurnRequestConflictError()
        insertRequest.run(
          input.requestId,
          input.requestFingerprint,
          input.conversationId,
          input.branchId,
          input.runId,
          input.createdAt,
        )
        return {
          branchId: input.branchId,
          conversationId: input.conversationId,
          created: true,
          requestFingerprint: input.requestFingerprint,
          requestId: input.requestId,
          runId: input.runId,
        }
      })
    },
    retryInterrupted(input) {
      return withTransaction(database, () => {
        const request = findRequest.get(input.requestId) as TurnRequestRow | undefined
        if (!request)
          throw new TurnRequestConflictError()
        const run = findRun.get(request.run_id) as RetryRunRow | undefined
        if (!run)
          throw new TurnRequestConflictError()
        if (findConversationDeletion.get(run.conversation_id))
          throw new TurnRequestConflictError()
        if (run.status !== 'failed' || run.error_code !== 'RUNTIME_RESTARTED')
          return toRecord(request, false)

        const previous = findPreviousCompletedSession.get(
          run.conversation_id,
          run.branch_id,
        ) as { pi_session_file: string } | undefined
        insertRun.run(
          input.runId,
          run.conversation_id,
          run.branch_id,
          run.triggering_message_id,
          run.provider,
          run.model,
          run.context_window,
          run.max_tokens,
          previous?.pi_session_file ?? null,
          input.createdAt,
          run.execution_profile,
        )
        if (Number(cloneRunInput.run(input.runId, input.createdAt, request.run_id).changes) !== 1)
          throw new TurnRequestConflictError()
        if (Number(updateRequestRun.run(input.runId, input.requestId, request.run_id).changes) !== 1)
          throw new TurnRequestConflictError()
        return {
          ...toRecord(request, true),
          runId: input.runId,
        }
      })
    },
  }
}

export class TurnRequestConflictError extends Error {
  readonly code = 'VALIDATION_FAILED'

  constructor() {
    super('Lexora Buddy turn request conflicts with an existing request')
    this.name = 'TurnRequestConflictError'
  }
}

export class TurnRequestAttachmentError extends Error {
  readonly code = 'ATTACHMENT_NOT_FOUND'

  constructor() {
    super('Lexora Buddy turn request attachment is unavailable')
    this.name = 'TurnRequestAttachmentError'
  }
}

function toRecord(row: TurnRequestRow, created: boolean): TurnRequestRecord {
  return {
    branchId: row.branch_id,
    conversationId: row.conversation_id,
    created,
    requestFingerprint: row.request_fingerprint,
    requestId: row.request_id,
    runId: row.run_id,
  }
}
