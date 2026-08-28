import type { BuddyExecutionProfile } from '../../../shared/executionProfile'
import type { BuddyServiceTier, BuddyThinkingLevel } from '../../../shared/modelSelection'

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

export interface ConversationRow {
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

export function requireConversationRecord(value: unknown, id: string): ConversationRecord {
  const row = value as ConversationRow | undefined
  if (!row)
    throw new Error(`Lexora Buddy conversation was not persisted: ${id}`)
  return toConversationRecord(row)
}

export function toConversationRecord(row: ConversationRow): ConversationRecord {
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
