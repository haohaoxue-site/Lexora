import type { DatabaseSync } from 'node:sqlite'
import type {
  BuddyComposerDraft,
  BuddyComposerDraftOpen,
  BuddyComposerDraftSave,
  BuddyComposerDraftScope,
} from '../../../shared/composerDraft'
import { buddyComposerDraftSchema } from '../../../shared/composerDraft'
import { withTransaction } from './database'

interface ComposerDraftRow {
  approval_policy: BuddyComposerDraft['executionConfig']['approvalPolicy']
  branch_id: string | null
  content_json: string
  conversation_id: string | null
  execution_profile: BuddyComposerDraft['executionConfig']['executionProfile']
  id: string
  model_selection_json: string | null
  revision: number
  scope_kind: BuddyComposerDraftScope['kind']
  source_message_id: string | null
  space_id: string | null
  updated_at: string
}

export interface ComposerDraftRepository {
  findById: (draftId: string) => BuddyComposerDraft | null
  findByScope: (scope: BuddyComposerDraftScope) => BuddyComposerDraft | null
  open: (input: BuddyComposerDraftOpen & { now: string }) => BuddyComposerDraft
  save: (input: BuddyComposerDraftSave & { now: string }) => BuddyComposerDraft
}

export class ComposerDraftConflictError extends Error {
  readonly code = 'DRAFT_CONFLICT'

  constructor() {
    super('Lexora Buddy Composer draft revision conflicts with the persisted draft')
    this.name = 'ComposerDraftConflictError'
  }
}

export function createComposerDraftRepository(database: DatabaseSync): ComposerDraftRepository {
  const findByIdStatement = database.prepare('SELECT * FROM composer_drafts WHERE id = ?')
  const findGlobal = database.prepare('SELECT * FROM composer_drafts WHERE scope_kind = \'global\'')
  const findSpace = database.prepare('SELECT * FROM composer_drafts WHERE scope_kind = \'space\' AND space_id = ?')
  const findBranch = database.prepare(`
    SELECT * FROM composer_drafts
    WHERE scope_kind = 'conversation_branch' AND conversation_id = ? AND branch_id = ?
  `)
  const findMessageEdit = database.prepare(`
    SELECT * FROM composer_drafts
    WHERE scope_kind = 'message_edit' AND conversation_id = ? AND branch_id = ?
      AND source_message_id = ?
  `)
  const insert = database.prepare(`
    INSERT INTO composer_drafts (
      id, scope_kind, space_id, conversation_id, branch_id, source_message_id, revision,
      content_json, model_selection_json, approval_policy, execution_profile,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
  `)
  const save = database.prepare(`
    UPDATE composer_drafts
    SET revision = revision + 1, content_json = ?, model_selection_json = ?,
      approval_policy = ?, execution_profile = ?, updated_at = ?
    WHERE id = ? AND revision = ?
  `)

  const findById = (draftId: string): BuddyComposerDraft | null => {
    const row = findByIdStatement.get(draftId) as unknown as ComposerDraftRow | undefined
    return row ? toDraft(row) : null
  }

  const findByScope = (scope: BuddyComposerDraftScope): BuddyComposerDraft | null => {
    const row = scope.kind === 'global'
      ? findGlobal.get()
      : scope.kind === 'space'
        ? findSpace.get(scope.spaceId)
        : scope.kind === 'conversation_branch'
          ? findBranch.get(scope.conversationId, scope.branchId)
          : findMessageEdit.get(scope.conversationId, scope.branchId, scope.userMessageId)
    return row ? toDraft(row as unknown as ComposerDraftRow) : null
  }

  return {
    findById,
    findByScope,
    open(input) {
      return withTransaction(database, () => {
        const scoped = findByScope(input.scope)
        if (scoped)
          return scoped
        if (findById(input.draftId))
          throw new ComposerDraftConflictError()
        const binding = toScopeBinding(input.scope)
        insert.run(
          input.draftId,
          input.scope.kind,
          binding.spaceId,
          binding.conversationId,
          binding.branchId,
          binding.sourceMessageId,
          JSON.stringify(input.initialContent),
          input.initialModelSelection ? JSON.stringify(input.initialModelSelection) : null,
          input.initialExecutionConfig.approvalPolicy,
          input.initialExecutionConfig.executionProfile,
          input.now,
          input.now,
        )
        return requireDraft(findById(input.draftId))
      })
    },
    save(input) {
      if (Number(save.run(
        JSON.stringify(input.content),
        input.modelSelection ? JSON.stringify(input.modelSelection) : null,
        input.executionConfig.approvalPolicy,
        input.executionConfig.executionProfile,
        input.now,
        input.draftId,
        input.expectedRevision,
      ).changes) !== 1) {
        throw new ComposerDraftConflictError()
      }
      return requireDraft(findById(input.draftId))
    },
  }
}

function toDraft(row: ComposerDraftRow): BuddyComposerDraft {
  return buddyComposerDraftSchema.parse({
    content: JSON.parse(row.content_json),
    draftId: row.id,
    executionConfig: {
      approvalPolicy: row.approval_policy,
      executionProfile: row.execution_profile,
    },
    modelSelection: row.model_selection_json ? JSON.parse(row.model_selection_json) : null,
    revision: row.revision,
    scope: row.scope_kind === 'global'
      ? { kind: 'global' }
      : row.scope_kind === 'space'
        ? { kind: 'space', spaceId: requireValue(row.space_id) }
        : {
            branchId: requireValue(row.branch_id),
            conversationId: requireValue(row.conversation_id),
            ...(row.scope_kind === 'conversation_branch'
              ? { kind: 'conversation_branch' as const }
              : {
                  kind: 'message_edit' as const,
                  userMessageId: requireValue(row.source_message_id),
                }),
          },
    updatedAt: row.updated_at,
  })
}

function toScopeBinding(scope: BuddyComposerDraftScope) {
  switch (scope.kind) {
    case 'global': return { branchId: null, conversationId: null, sourceMessageId: null, spaceId: null }
    case 'space': return { branchId: null, conversationId: null, sourceMessageId: null, spaceId: scope.spaceId }
    case 'conversation_branch': return {
      branchId: scope.branchId,
      conversationId: scope.conversationId,
      sourceMessageId: null,
      spaceId: null,
    }
    case 'message_edit': return {
      branchId: scope.branchId,
      conversationId: scope.conversationId,
      sourceMessageId: scope.userMessageId,
      spaceId: null,
    }
  }
}

function requireDraft(draft: BuddyComposerDraft | null): BuddyComposerDraft {
  if (!draft)
    throw new ComposerDraftConflictError()
  return draft
}

function requireValue(value: string | null): string {
  if (value === null)
    throw new ComposerDraftConflictError()
  return value
}
