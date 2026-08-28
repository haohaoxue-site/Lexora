import type { BuddyExecutionProfile } from '../../../shared/executionProfile'

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type RunPurpose = 'automation' | 'chat' | 'conversation.compaction'

export interface RunRecord {
  id: string
  conversationId: string
  branchId: string
  triggeringMessageId: string
  provider: string
  model: string
  contextWindow: number | null
  maxTokens: number | null
  purpose: RunPurpose
  status: RunStatus
  piSessionFile: string | null
  errorCode: string | null
  executionProfile: BuddyExecutionProfile
  startedAt: string
  completedAt: string | null
}

export interface RunRow {
  id: string
  conversation_id: string
  branch_id: string
  triggering_message_id: string
  provider: string
  model: string
  context_window: number | null
  max_tokens: number | null
  purpose: RunPurpose
  status: RunStatus
  pi_session_file: string | null
  error_code: string | null
  execution_profile: BuddyExecutionProfile
  started_at: string
  completed_at: string | null
}

export function requireRunRecord(value: unknown, id: string): RunRecord {
  const row = value as RunRow | undefined
  if (!row)
    throw new Error(`Lexora Buddy run was not persisted: ${id}`)
  return toRunRecord(row)
}

export function toRunRecord(row: RunRow): RunRecord {
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
    executionProfile: row.execution_profile,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }
}
