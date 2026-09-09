import type { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { createBuddyUserContent } from '../../../../shared/conversation/buddyUserContent'
import {
  ComposerDraftConflictError,
  createComposerDraftRepository,
} from '../composerDraftRepository'
import { openBuddyDatabase } from '../database'

const databases: DatabaseSync[] = []

afterEach(() => {
  for (const database of databases.splice(0))
    database.close()
})

describe('composerDraftRepository', () => {
  it('restores quote snapshots from SQLite without rewriting a legacy draft', () => {
    const database = createDatabase()
    const repository = createComposerDraftRepository(database)
    const initial = repository.open(createOpenInput())
    const quote = { id: 'quote-1', text: '    enabled: true\n', source: { conversationId: 'conversation-1', branchId: 'branch-1', messageId: 'message-1', role: 'assistant' as const, runId: 'run-1' } }
    const saved = repository.save({ ...initial, content: { ...initial.content, quotes: [quote] }, expectedRevision: 0, now: '2026-09-06T00:00:01.000Z' })
    expect(createComposerDraftRepository(database).findById(initial.draftId)).toEqual(saved)
    expect(saved.content.quotes).toEqual([quote])
    expect(initial.content).toEqual(createBuddyUserContent('Hello'))
  })

  it('opens one canonical draft per scope and persists the complete initial snapshot', () => {
    const database = createDatabase()
    seedSpace(database)
    const repository = createComposerDraftRepository(database)
    const input = {
      draftId: 'draft-1',
      initialContent: createBuddyUserContent('Hello'),
      initialExecutionConfig: {
        approvalPolicy: 'manual' as const,
        executionProfile: 'read_only' as const,
      },
      initialModelSelection: {
        modelId: 'gpt-6-astra',
        providerId: 'openai-codex',
        reasoning: 'high' as const,
        serviceTier: 'priority' as const,
      },
      now: '2026-09-06T00:00:00.000Z',
      scope: { kind: 'space' as const, spaceId: 'space-1' },
    }

    expect(repository.open(input)).toEqual({
      content: input.initialContent,
      draftId: 'draft-1',
      executionConfig: input.initialExecutionConfig,
      modelSelection: input.initialModelSelection,
      revision: 0,
      scope: input.scope,
      updatedAt: input.now,
    })
    expect(repository.open({ ...input, draftId: 'draft-2' }).draftId).toBe('draft-1')
  })

  it('saves whole snapshots with compare-and-swap revisions', () => {
    const repository = createComposerDraftRepository(createDatabase())
    repository.open(createOpenInput())

    const saved = repository.save({
      content: createBuddyUserContent('Updated'),
      draftId: 'draft-1',
      executionConfig: {
        approvalPolicy: 'manual',
        executionProfile: 'full_access',
      },
      expectedRevision: 0,
      modelSelection: null,
      now: '2026-09-06T00:00:01.000Z',
    })

    expect(saved).toMatchObject({
      content: createBuddyUserContent('Updated'),
      executionConfig: {
        approvalPolicy: 'manual',
        executionProfile: 'full_access',
      },
      modelSelection: null,
      revision: 1,
    })
    expect(() => repository.save({
      ...saved,
      expectedRevision: 0,
      now: '2026-09-06T00:00:02.000Z',
    })).toThrow(ComposerDraftConflictError)
    expect(repository.findById('draft-1')).toEqual(saved)
  })
})

function createDatabase(): DatabaseSync {
  const database = openBuddyDatabase({ databasePath: ':memory:' })
  databases.push(database)
  return database
}

function createOpenInput() {
  return {
    draftId: 'draft-1',
    initialContent: createBuddyUserContent('Hello'),
    initialExecutionConfig: {
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write' as const,
    },
    initialModelSelection: null,
    now: '2026-09-06T00:00:00.000Z',
    scope: { kind: 'global' as const },
  }
}

function seedSpace(database: DatabaseSync): void {
  database.prepare(`
    INSERT INTO spaces (id, name, memory_scope, created_at, updated_at)
    VALUES (?, ?, 'personal_and_space', ?, ?)
  `).run(
    'space-1',
    'Workspace',
    '2026-09-06T00:00:00.000Z',
    '2026-09-06T00:00:00.000Z',
  )
}
