import type { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync as NodeDatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'

import { openBuddyDatabase } from '../database'
import { BUDDY_SCHEMA_MIGRATIONS, BUDDY_SCHEMA_VERSION } from '../schema'
import { createUsageRepository } from '../usageRepository'

const databases: DatabaseSync[] = []
const directories: string[] = []

afterEach(() => {
  for (const database of databases.splice(0))
    database.close()
  for (const directory of directories.splice(0))
    rmSync(directory, { force: true, recursive: true })
})

function createDatabase(): DatabaseSync {
  const database = openBuddyDatabase({ databasePath: ':memory:' })
  databases.push(database)
  return database
}

function seedRun(
  database: DatabaseSync,
  memoryScope: 'personal_and_project' | 'personal_and_space' = 'personal_and_space',
): void {
  database.exec(`
    INSERT INTO spaces (
      id, name, memory_scope, revoked_at, created_at, updated_at
    ) VALUES (
      'space-1', 'Workspace', '${memoryScope}', NULL,
      '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z'
    );
    INSERT INTO space_directory_bindings (
      id, space_id, root, canonical_root, access_granted_at, resources_trusted_at,
      is_primary, revision, revoked_at, created_at, updated_at
    ) VALUES (
      'directory-1', 'space-1', '/workspace', '/workspace',
      '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z',
      1, 1, NULL, '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z'
    );
    INSERT INTO conversations (
      id, space_id, title, active_branch_id, created_at, updated_at
    ) VALUES (
      'conversation-1', 'space-1', 'Conversation', NULL,
      '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z'
    );
    INSERT INTO conversation_branches (
      id, conversation_id, parent_branch_id, forked_from_message_id, created_at
    ) VALUES (
      'branch-1', 'conversation-1', NULL, NULL, '2026-08-14T00:00:00.000Z'
    );
    UPDATE conversations SET active_branch_id = 'branch-1' WHERE id = 'conversation-1';
    INSERT INTO messages (
      id, conversation_id, branch_id, run_id, role, content_json, created_at
    ) VALUES (
      'message-1', 'conversation-1', 'branch-1', NULL, 'user',
      '{"text":"hello"}', '2026-08-14T00:00:00.000Z'
    );
    INSERT INTO runs (
      id, conversation_id, branch_id, triggering_message_id, provider, model,
      purpose, status, pi_session_file, error_code, started_at, completed_at
    ) VALUES (
      'run-1', 'conversation-1', 'branch-1', 'message-1', 'anthropic',
      'claude-sonnet-4-5', 'chat', 'running', '/tmp/run-1.jsonl', NULL,
      '2026-08-14T00:00:00.000Z', NULL
    );
  `)
}

describe('buddy schema', () => {
  it('rejects partial or inverted model parameter pairs at the database boundary', () => {
    const database = createDatabase()
    database.exec(`
      INSERT INTO provider_model_states (
        provider_id, model_id, display_name, api, input_json, reasoning, cost_json,
        context_window, max_tokens, override_context_window, override_max_tokens,
        source_revision, acknowledged_source_revision, source, enabled, available,
        last_seen_at, created_at, updated_at
      ) VALUES (
        'anthropic', 'claude', 'Claude', 'anthropic-messages', '["text"]', 0,
        '{"input":0,"output":0,"cacheRead":0,"cacheWrite":0}',
        200000, 32000, NULL, NULL, '2026-08-20T00:00:00.000Z', NULL,
        'builtin', 1, 1, '2026-08-20T00:00:00.000Z',
        '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
      );
    `)

    expect(() => database.prepare(`
      UPDATE provider_model_states
      SET override_context_window = ?, override_max_tokens = ?
      WHERE provider_id = 'anthropic' AND model_id = 'claude'
    `).run(100_000, null)).toThrow(/valid pair/)
    expect(() => database.prepare(`
      UPDATE provider_model_states
      SET override_context_window = ?, override_max_tokens = ?
      WHERE provider_id = 'anthropic' AND model_id = 'claude'
    `).run(16_000, 32_000)).toThrow(/valid pair/)

    seedRun(database)
    expect(() => database.prepare(`
      UPDATE runs SET context_window = ?, max_tokens = ? WHERE id = 'run-1'
    `).run(200_000, null)).toThrow(/valid pair/)
  })

  it('rejects databases created by a newer Buddy version', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lexora-buddy-schema-'))
    directories.push(directory)
    const databasePath = join(directory, 'buddy.sqlite3')
    const database = new NodeDatabaseSync(databasePath)
    database.exec(`PRAGMA user_version = ${BUDDY_SCHEMA_VERSION + 1}`)
    database.close()

    expect(() => openBuddyDatabase({ databasePath })).toThrow(/newer schema version/i)
  })

  it('rejects an incomplete database that already claims the current schema version', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lexora-buddy-schema-'))
    directories.push(directory)
    const databasePath = join(directory, 'buddy.sqlite3')
    const database = new NodeDatabaseSync(databasePath)
    for (const migration of BUDDY_SCHEMA_MIGRATIONS.filter(({ version }) => version <= 8)) {
      database.exec(migration.sql)
      database.exec(`PRAGMA user_version = ${migration.version}`)
    }
    database.exec(`PRAGMA user_version = ${BUDDY_SCHEMA_VERSION}`)
    database.close()

    expect(() => openBuddyDatabase({ databasePath })).toThrow(/incomplete schema version/i)
  })

  it('migrates v8 to v9 without interpreting legacy workspace Draft content', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lexora-buddy-schema-'))
    directories.push(directory)
    const databasePath = join(directory, 'buddy.sqlite3')
    const legacy = new NodeDatabaseSync(databasePath)
    legacy.exec('PRAGMA foreign_keys = ON')
    for (const migration of BUDDY_SCHEMA_MIGRATIONS.filter(({ version }) => version <= 8)) {
      legacy.exec(migration.sql)
      legacy.exec(`PRAGMA user_version = ${migration.version}`)
    }
    seedRun(legacy)
    const legacyWorkspace = JSON.stringify({
      activeConversationId: 'conversation-1',
      drafts: [{
        attachments: [{ attachmentId: 'legacy-attachment' }],
        composerContent: {
          attrs: { panelResourceIds: [] },
          content: [{
            content: [{ attrs: { value: '/review' }, type: 'chatPromptToken' }],
            type: 'paragraph',
          }],
          type: 'doc',
        },
        content: '/review',
        draftId: 'legacy-draft',
        targetKey: 'conversation:conversation-1:branch-1',
      }],
      spaceId: 'space-1',
    })
    legacy.prepare(`
      INSERT INTO workspace_settings (key, value_json, updated_at)
      VALUES ('buddy.chat.workspace.v2', ?, '2026-09-06T00:00:00.000Z')
    `).run(legacyWorkspace)
    legacy.close()

    const database = openBuddyDatabase({ databasePath })
    databases.push(database)
    expect(database.prepare('PRAGMA user_version').get()).toEqual({
      user_version: BUDDY_SCHEMA_VERSION,
    })
    expect(database.prepare(`
      SELECT value_json FROM workspace_settings WHERE key = 'buddy.chat.workspace.v2'
    `).get()).toEqual({ value_json: legacyWorkspace })
    expect(database.prepare(`SELECT id FROM messages WHERE id = 'message-1'`).get())
      .toEqual({ id: 'message-1' })
    expect(database.prepare('SELECT * FROM composer_drafts').all()).toEqual([])
    expect(database.prepare('SELECT * FROM composer_resources').all()).toEqual([])
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('migrates controlled profiles and preserves foreign keys in v6', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lexora-buddy-schema-'))
    directories.push(directory)
    const databasePath = join(directory, 'buddy.sqlite3')
    const legacy = new NodeDatabaseSync(databasePath)
    legacy.exec('PRAGMA foreign_keys = ON')
    for (const migration of BUDDY_SCHEMA_MIGRATIONS.filter(({ version }) => version <= 5)) {
      legacy.exec(migration.sql)
      legacy.exec(`PRAGMA user_version = ${migration.version}`)
    }
    seedRun(legacy, 'personal_and_project')
    legacy.exec(`
      INSERT INTO automations (
        id, name, prompt, space_id, model_mode, provider_id, model_id,
        reasoning, schedule_kind, schedule_json, timezone, active_from,
        active_until, status, blocked_reason, next_run_at, last_run_at,
        deleted_at, revision, created_at, updated_at, execution_profile
      ) VALUES (
        'automation-1', 'Daily review', 'Review', 'space-1', 'default',
        NULL, NULL, NULL, 'once',
        '{"kind":"once","runAt":"2026-09-04T00:00:00.000Z"}',
        'Asia/Shanghai', NULL, NULL, 'blocked', 'AUTOMATION_PROJECT_UNAVAILABLE',
        NULL, NULL, NULL, 1,
        '2026-09-03T00:00:00.000Z', '2026-09-03T00:00:00.000Z',
        'controlled'
      );

      INSERT INTO workspace_settings (key, value_json, updated_at)
      VALUES (
        'buddy.chat.workspace.v2',
        '{"activeConversationId":null,"drafts":[{"attachments":[],"composerContent":null,"content":"","draftId":"draft-1","executionProfile":"controlled","requestFingerprint":null,"requestId":null,"targetKey":"global"}],"spaceId":null}',
        '2026-09-03T00:00:00.000Z'
      );
    `)
    legacy.close()

    const database = openBuddyDatabase({ databasePath })
    databases.push(database)
    for (const table of ['conversations', 'runs', 'automations']) {
      expect(database.prepare(`SELECT execution_profile FROM ${table} LIMIT 1`).get())
        .toEqual({ execution_profile: 'workspace_write' })
      expect(() => database.prepare(`
        UPDATE ${table} SET execution_profile = 'controlled'
      `).run()).toThrow(/CHECK constraint/)
    }
    for (const table of ['conversations', 'runs']) {
      expect(database.prepare(`SELECT approval_policy FROM ${table} LIMIT 1`).get())
        .toEqual({ approval_policy: 'policy' })
      expect(() => database.prepare(`
        UPDATE ${table} SET approval_policy = 'unknown'
      `).run()).toThrow(/CHECK constraint/)
    }
    expect(database.prepare(`
      SELECT memory_scope FROM spaces WHERE id = 'space-1'
    `).get()).toEqual({ memory_scope: 'personal_and_space' })
    expect(database.prepare(`
      SELECT blocked_reason FROM automations WHERE id = 'automation-1'
    `).get()).toEqual({ blocked_reason: 'AUTOMATION_SPACE_UNAVAILABLE' })
    expect(() => database.prepare(`
      UPDATE spaces SET memory_scope = 'personal_and_project' WHERE id = 'space-1'
    `).run()).toThrow(/CHECK constraint/)
    const workspace = database.prepare(`
      SELECT value_json FROM workspace_settings WHERE key = 'buddy.chat.workspace.v2'
    `).get() as { value_json: string }
    expect(JSON.parse(workspace.value_json)).toMatchObject({
      drafts: [{
        approvalPolicy: 'policy',
        executionProfile: 'workspace_write',
      }],
    })
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('drops exploratory inferred artifacts when adopting explicit output semantics', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lexora-buddy-schema-'))
    directories.push(directory)
    const databasePath = join(directory, 'buddy.sqlite3')
    const legacy = new NodeDatabaseSync(databasePath)
    legacy.exec('PRAGMA foreign_keys = ON')
    for (const migration of BUDDY_SCHEMA_MIGRATIONS.filter(({ version }) => version <= 4)) {
      legacy.exec(migration.sql)
      legacy.exec(`PRAGMA user_version = ${migration.version}`)
    }
    seedRun(legacy, 'personal_and_project')
    legacy.prepare(`
      INSERT INTO artifacts (
        id, conversation_id, run_id, source_tool_call_id, source_artifact_id,
        stored_path, name, mime_type, size_bytes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'artifact-legacy',
      'conversation-1',
      'run-1',
      'tool-legacy',
      null,
      '/workspace/legacy.html',
      'legacy.html',
      'text/html',
      17,
      '2026-08-14T00:00:01.000Z',
    )
    legacy.close()

    const database = openBuddyDatabase({ databasePath })
    databases.push(database)
    expect(database.prepare('SELECT * FROM artifacts').all()).toEqual([])
    expect(database.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'artifact_changes'
    `).get()).toBeUndefined()
  })

  it('rejects unversioned application tables', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lexora-buddy-schema-'))
    directories.push(directory)
    const databasePath = join(directory, 'buddy.sqlite3')
    const database = new NodeDatabaseSync(databasePath)
    database.exec('CREATE TABLE spaces (id TEXT PRIMARY KEY)')
    database.close()

    expect(() => openBuddyDatabase({ databasePath })).toThrow(/unversioned schema/i)
  })

  it('enforces Space foreign keys', () => {
    const database = createDatabase()
    const statement = database.prepare(`
      INSERT INTO conversations (
        id, space_id, title, active_branch_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `)

    expect(() => statement.run(
      'conversation-1',
      'missing-space',
      null,
      null,
      '2026-08-14T00:00:00.000Z',
      '2026-08-14T00:00:00.000Z',
    )).toThrow(/FOREIGN KEY/)
  })

  it('deduplicates usage by run, source entry, and purpose', () => {
    const database = createDatabase()
    seedRun(database)
    const usage = createUsageRepository(database)
    const insert = database.prepare(`
      INSERT INTO usage_records (
        id, run_id, source_entry_id, provider, model, purpose,
        input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
        reasoning_tokens, total_tokens, input_cost, output_cost,
        cache_read_cost, cache_write_cost, total_cost, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const values = [
      'usage-1',
      'run-1',
      'pi-entry-1',
      'anthropic',
      'claude-sonnet-4-5',
      'turn',
      10,
      5,
      2,
      1,
      null,
      18,
      0.1,
      0.2,
      0.01,
      0.02,
      0.33,
      '2026-08-14T00:00:01.000Z',
    ] as const

    insert.run(...values)
    expect(() => insert.run('usage-2', ...values.slice(1))).toThrow(/UNIQUE/)
    expect(usage.listForRun('run-1')).toHaveLength(1)
    expect(usage.findBySource('run-1', 'pi-entry-1', 'turn')).toMatchObject({
      id: 'usage-1',
      runId: 'run-1',
      sourceEntryId: 'pi-entry-1',
    })
    expect(usage.summarize()).toMatchObject({
      inputTokens: 10,
      outputTokens: 5,
      recordCount: 1,
      totalCost: 0.33,
      totalTokens: 18,
    })
  })
})
