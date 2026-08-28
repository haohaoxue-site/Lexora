import type { DatabaseSync } from 'node:sqlite'
import type { BuddyExecutionProfile } from '../../../shared/executionProfile'
import type {
  ActivateConversationBranchInput,
  ConversationHistoryRepository,
} from './conversationHistoryRepository'
import type { ConversationIndexRepository } from './conversationIndexRepository'
import type {
  ConversationModelSelection,
  ConversationRecord,
  ConversationRow,
} from './conversationRecord'
import type { ConversationTimelineRepository } from './conversationTimelineRepository'
import { createConversationHistoryStore } from './conversationHistoryRepository'
import { createConversationIndexRepository } from './conversationIndexRepository'
import { requireConversationRecord, toConversationRecord } from './conversationRecord'
import { createConversationTimelineRepository } from './conversationTimelineRepository'
import { withTransaction } from './database'

export interface CreateConversationInput {
  id: string
  branchId: string
  projectId: string | null
  title: string | null
  createdAt: string
  executionProfile: BuddyExecutionProfile
  origin?: ConversationRecord['origin']
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

export interface ConversationRepository
  extends ConversationHistoryRepository, ConversationIndexRepository, ConversationTimelineRepository {
  activateBranch: (input: ActivateConversationBranchInput) => ConversationRecord
  create: (input: CreateConversationInput) => ConversationRecord
  findById: (id: string) => ConversationRecord | null
  isDeleted: (id: string) => boolean
  markDeleted: (id: string, deletedAt: string) => boolean
  rename: (input: RenameConversationInput) => ConversationRecord
  setExecutionProfile: (
    input: SetConversationExecutionProfileInput,
  ) => ConversationRecord | null
  setModelSelection: (
    input: SetConversationModelSelectionInput,
  ) => ConversationRecord | null
}

export function createConversationRepository(database: DatabaseSync): ConversationRepository {
  const findConversation = database.prepare('SELECT * FROM conversations WHERE id = ?')
  const insertConversation = database.prepare(`
    INSERT INTO conversations (
      id, project_id, title, active_branch_id, created_at, updated_at,
      execution_profile, origin, deleted_at
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NULL)
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
  const history = createConversationHistoryStore(database)
  const index = createConversationIndexRepository(database)
  const timeline = createConversationTimelineRepository(database, history.lineage)

  return {
    activateBranch(input) {
      return withTransaction(database, () => {
        history.activateBranch(input)
        return requireConversationRecord(
          findConversation.get(input.conversationId),
          input.conversationId,
        )
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
        history.insertRootBranch({
          branchId: input.branchId,
          conversationId: input.id,
          createdAt: input.createdAt,
        })
        return requireConversationRecord(
          findConversation.get(input.id),
          input.id,
        )
      })
    },
    createBranch: history.repository.createBranch,
    createMessage: history.repository.createMessage,
    findById(id) {
      const row = findConversation.get(id) as ConversationRow | undefined
      return row ? toConversationRecord(row) : null
    },
    findMessageById: history.repository.findMessageById,
    isDeleted(id) {
      const row = findConversation.get(id) as ConversationRow | undefined
      return row?.deleted_at !== null && row?.deleted_at !== undefined
    },
    listBranchMessages: history.repository.listBranchMessages,
    listBranches: history.repository.listBranches,
    listMessagePage: history.repository.listMessagePage,
    listMessages: history.repository.listMessages,
    listRecent: index.listRecent,
    listTimelinePage: timeline.listTimelinePage,
    markDeleted(id, deletedAt) {
      return Number(markDeleted.run(deletedAt, deletedAt, id).changes) === 1
    },
    rename(input) {
      if (Number(renameConversation.run(input.title, input.updatedAt, input.id).changes) !== 1)
        throw new ConversationRepositoryError('cannot be renamed')
      return requireConversationRecord(
        findConversation.get(input.id),
        input.id,
      )
    },
    setExecutionProfile(input) {
      return withTransaction(database, () => {
        const current = findConversation.get(input.id) as ConversationRow | undefined
        if (!current || current.deleted_at !== null)
          return null
        if (current.execution_profile === input.executionProfile)
          return toConversationRecord(current)
        if (Number(setExecutionProfile.run(
          input.executionProfile,
          input.updatedAt,
          input.id,
        ).changes) !== 1) {
          return null
        }
        return requireConversationRecord(
          findConversation.get(input.id),
          input.id,
        )
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
      return requireConversationRecord(
        findConversation.get(input.id),
        input.id,
      )
    },
  }
}

class ConversationRepositoryError extends Error {
  readonly code = 'VALIDATION_FAILED'

  constructor(reason: string) {
    super(`Lexora Buddy conversation ${reason}`)
    this.name = 'ConversationRepositoryError'
  }
}
