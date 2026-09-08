import type { Usage } from '@earendil-works/pi-ai'
import type { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import { createRunEventLog } from '../../events/createRunEventLog'
import { openBuddyDatabase } from '../../storage/database'
import { createUsageRepository } from '../../storage/usageRepository'
import { UsageService } from '../UsageService'

const databases: DatabaseSync[] = []
const directories: string[] = []

afterEach(async () => {
  for (const database of databases.splice(0))
    database.close()
  await Promise.all(directories.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

describe('recordPiUsage', () => {
  it('records one usage event for a stable Pi entry id', async () => {
    const database = createDatabase()
    seedRun(database)
    const root = await mkdtemp(join(tmpdir(), 'lexora-buddy-usage-dedupe-'))
    directories.push(root)
    const eventLog = createRunEventLog({
      conversationsDirectory: join(root, 'conversations'),
      database,
    })
    const repository = createUsageRepository(database)
    const service = new UsageService({
      eventLog,
      repository,
    })
    const input = {
      createdAt: '2026-08-14T00:00:01.000Z',
      model: 'claude-sonnet-4-5',
      provider: 'anthropic',
      purpose: 'turn' as const,
      runId: 'run-1',
      sourceEntryId: 'pi-entry-1',
      usage: usage(),
    }

    expect(await service.record(input)).not.toBeNull()
    expect(await service.record(input)).toBeNull()
    const events = await eventLog.read('run-1')
    expect(events.map(event => event.type)).toEqual(['usage.recorded'])
    expect(repository.listForRun('run-1')).toMatchObject([{
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 3,
      cacheWriteTokens: 4,
      reasoningTokens: 2,
      totalTokens: 22,
      inputCost: 0.01,
      outputCost: 0.02,
      cacheReadCost: 0.03,
      cacheWriteCost: 0.04,
      totalCost: 0.1,
    }])
  })

  it('does not project usage until its event is durable', async () => {
    const database = createDatabase()
    seedRun(database)
    const repository = createUsageRepository(database)
    const input = {
      createdAt: '2026-08-14T00:00:01.000Z',
      model: 'claude-sonnet-4-5',
      provider: 'anthropic',
      purpose: 'turn' as const,
      runId: 'run-1',
      sourceEntryId: 'pi-entry-1',
      usage: usage(),
    }
    const failed = new UsageService({
      eventLog: {
        append: async () => {
          throw new Error('simulated event storage failure')
        },
      },
      repository,
    })

    await expect(failed.record(input)).rejects.toThrow('simulated event storage failure')
    expect(repository.listForRun('run-1')).toEqual([])

    const root = await mkdtemp(join(tmpdir(), 'lexora-buddy-usage-recovery-'))
    directories.push(root)
    const eventLog = createRunEventLog({
      conversationsDirectory: join(root, 'conversations'),
      database,
    })
    const recovered = new UsageService({ eventLog, repository })

    expect(await recovered.record(input)).not.toBeNull()
    expect(await recovered.record(input)).toBeNull()
    expect(repository.listForRun('run-1')).toHaveLength(1)
    const events = await eventLog.read('run-1')
    expect(events).toMatchObject([{
      payload: {
        usageRecordId: expect.any(String),
      },
      type: 'usage.recorded',
    }])
    expect(events[0]?.payload).toMatchObject({ sourceEntryId: 'pi-entry-1' })
  })

  it('rebuilds usage from the durable event after a projection failure', async () => {
    const database = createDatabase()
    seedRun(database)
    const repository = createUsageRepository(database)
    const root = await mkdtemp(join(tmpdir(), 'lexora-buddy-usage-projection-'))
    directories.push(root)
    const conversationsDirectory = join(root, 'conversations')
    const service = new UsageService({
      eventLog: createRunEventLog({ conversationsDirectory, database }),
      repository,
    })
    database.exec(`
      CREATE TRIGGER reject_usage_projection
      BEFORE INSERT ON usage_records
      BEGIN
        SELECT RAISE(ABORT, 'simulated usage projection failure');
      END;
    `)

    await expect(service.record({
      createdAt: '2026-08-14T00:00:01.000Z',
      model: 'claude-sonnet-4-5',
      provider: 'anthropic',
      purpose: 'turn',
      runId: 'run-1',
      sourceEntryId: 'pi-entry-1',
      usage: usage(),
    })).rejects.toThrow()

    database.exec('DROP TRIGGER reject_usage_projection')
    const recovered = createRunEventLog({ conversationsDirectory, database })

    expect(await recovered.replay('run-1')).toBe(1)
    expect(repository.listForRun('run-1')).toMatchObject([{
      model: 'claude-sonnet-4-5',
      provider: 'anthropic',
      purpose: 'turn',
      runId: 'run-1',
      sourceEntryId: 'pi-entry-1',
      totalCost: 0.1,
      totalTokens: 22,
    }])
  })
})

function usage(): Usage {
  return {
    cacheRead: 3,
    cacheWrite: 4,
    cost: {
      cacheRead: 0.03,
      cacheWrite: 0.04,
      input: 0.01,
      output: 0.02,
      total: 0.1,
    },
    input: 10,
    output: 5,
    reasoning: 2,
    totalTokens: 22,
  }
}

function createDatabase(): DatabaseSync {
  const database = openBuddyDatabase({ databasePath: ':memory:' })
  databases.push(database)
  return database
}

function seedRun(database: DatabaseSync): void {
  database.exec(`
    INSERT INTO conversations (
      id, space_id, title, active_branch_id, created_at, updated_at
    ) VALUES (
      'conversation-1', NULL, NULL, NULL,
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
