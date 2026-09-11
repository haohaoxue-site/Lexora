import type { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'

import { createConversationRepository } from '../conversationRepository'
import { openBuddyDatabase } from '../database'
import { createRunRepository } from '../runRepository'

const databases: DatabaseSync[] = []

afterEach(() => {
  for (const database of databases.splice(0))
    database.close()
})

describe('conversation history repositories', () => {
  it('rolls back conversation creation when its root branch cannot be inserted', () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    const conversations = createConversationRepository(database)
    conversations.create({
      branchId: 'branch-shared',
      createdAt: '2026-08-24T00:00:00.000Z',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      id: 'conversation-existing',
      spaceId: null,
      title: null,
    })

    expect(() => conversations.create({
      branchId: 'branch-shared',
      createdAt: '2026-08-24T00:01:00.000Z',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      id: 'conversation-rolled-back',
      spaceId: null,
      title: null,
    })).toThrow()
    expect(conversations.findById('conversation-rolled-back')).toBeNull()
  })

  it('projects pending approval ahead of running and returns terminal runs to idle', () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    const conversations = createConversationRepository(database)
    const runs = createRunRepository(database)
    conversations.create({
      branchId: 'branch-activity',
      createdAt: '2026-08-20T00:00:00.000Z',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      id: 'conversation-activity',
      spaceId: null,
      title: 'Activity',
    })

    expect(conversations.listRecent()).toMatchObject([
      { activity: 'idle', id: 'conversation-activity' },
    ])

    runs.create({
      branchId: 'branch-activity',
      conversationId: 'conversation-activity',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      id: 'run-activity',
      model: 'model-1',
      piSessionFile: null,
      provider: 'provider-1',
      purpose: 'conversation.compaction',
      startedAt: '2026-08-20T00:01:00.000Z',
      status: 'running',
      triggeringMessageId: 'message-activity',
    })
    expect(conversations.listRecent()[0]?.activity).toBe('running')

    database.prepare(`
      INSERT INTO approvals (
        id, run_id, tool_call_id, kind, status, summary,
        payload_json, created_at, resolved_at
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, NULL)
    `).run(
      'approval-activity',
      'run-activity',
      'tool-activity',
      'shell',
      'Run a command',
      '{}',
      '2026-08-20T00:02:00.000Z',
    )
    expect(conversations.listRecent()[0]?.activity).toBe('awaiting_approval')

    database.prepare(`
      UPDATE approvals SET status = 'approved', resolved_at = ? WHERE id = ?
    `).run('2026-08-20T00:03:00.000Z', 'approval-activity')
    expect(conversations.listRecent()[0]?.activity).toBe('running')

    runs.reconcileTerminal(
      'run-activity',
      'failed',
      '2026-08-20T00:04:00.000Z',
      'MODEL_REQUEST_FAILED',
    )
    expect(conversations.listRecent()[0]?.activity).toBe('idle')
  })

  it('paginates the visible branch lineage without duplicating the page boundary', () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    const conversations = createConversationRepository(database)
    conversations.create({
      branchId: 'branch-root',
      createdAt: '2026-08-14T00:00:00.000Z',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      id: 'conversation-1',
      spaceId: null,
      title: null,
    })
    for (const index of [1, 2, 3, 4, 5]) {
      conversations.createMessage({
        branchId: 'branch-root',
        content: { text: `root-${index}` },
        conversationId: 'conversation-1',
        createdAt: `2026-08-14T00:00:0${index}.000Z`,
        id: `root-${index}`,
        role: index % 2 === 0 ? 'assistant' : 'user',
        runId: null,
      })
    }
    conversations.createBranch({
      activate: true,
      conversationId: 'conversation-1',
      createdAt: '2026-08-14T00:00:06.000Z',
      forkedFromMessageId: 'root-4',
      id: 'branch-child',
      parentBranchId: 'branch-root',
    })
    for (const index of [1, 2]) {
      conversations.createMessage({
        branchId: 'branch-child',
        content: { text: `child-${index}` },
        conversationId: 'conversation-1',
        createdAt: `2026-08-14T00:00:0${index + 6}.000Z`,
        id: `child-${index}`,
        role: index % 2 === 0 ? 'assistant' : 'user',
        runId: null,
      })
    }

    const newest = conversations.listMessagePage('conversation-1', 'branch-child', {
      limit: 2,
    })
    expect(newest.items.map(message => message.id)).toEqual(['child-1', 'child-2'])
    expect(newest.nextBeforeMessageId).toBe('child-1')

    const middle = conversations.listMessagePage('conversation-1', 'branch-child', {
      beforeMessageId: newest.nextBeforeMessageId,
      limit: 3,
    })
    expect(middle.items.map(message => message.id)).toEqual(['root-2', 'root-3', 'root-4'])
    expect(middle.nextBeforeMessageId).toBe('root-2')

    const oldest = conversations.listMessagePage('conversation-1', 'branch-child', {
      beforeMessageId: middle.nextBeforeMessageId,
      limit: 3,
    })
    expect(oldest.items.map(message => message.id)).toEqual(['root-1'])
    expect(oldest.nextBeforeMessageId).toBeNull()
    expect(() => conversations.listMessagePage('conversation-1', 'branch-child', {
      beforeMessageId: 'root-5',
      limit: 2,
    })).toThrow(/cursor/i)
  })

  it('paginates messages and manual compactions through the visible branch lineage', () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    const conversations = createConversationRepository(database)
    const runs = createRunRepository(database)
    conversations.create({
      branchId: 'branch-root',
      createdAt: '2026-08-14T00:00:00.000Z',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      id: 'conversation-1',
      spaceId: null,
      title: null,
    })
    for (const index of [1, 2, 3]) {
      conversations.createMessage({
        branchId: 'branch-root',
        content: { text: `root-${index}` },
        conversationId: 'conversation-1',
        createdAt: `2026-08-14T00:00:0${index * 2}.000Z`,
        id: `root-${index}`,
        role: index % 2 === 0 ? 'assistant' : 'user',
        runId: null,
      })
    }
    runs.create({
      branchId: 'branch-root',
      completedAt: '2026-08-14T00:00:03.500Z',
      conversationId: 'conversation-1',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      id: 'compact-visible',
      model: 'model-1',
      piSessionFile: '/tmp/session.jsonl',
      provider: 'provider-1',
      purpose: 'conversation.compaction',
      startedAt: '2026-08-14T00:00:02.000Z',
      status: 'completed',
      triggeringMessageId: 'root-1',
    })
    database.prepare(`
      INSERT INTO run_events (run_id, sequence, event_type, payload_json, created_at)
      VALUES (?, 1, 'context.compaction.completed', ?, ?)
    `).run(
      'compact-visible',
      JSON.stringify({ estimatedTokensAfter: 700, tokensBefore: 1400 }),
      '2026-08-14T00:00:03.500Z',
    )
    runs.create({
      branchId: 'branch-root',
      completedAt: '2026-08-14T00:00:07.500Z',
      conversationId: 'conversation-1',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      id: 'compact-hidden',
      model: 'model-1',
      piSessionFile: '/tmp/session.jsonl',
      provider: 'provider-1',
      purpose: 'conversation.compaction',
      startedAt: '2026-08-14T00:00:07.000Z',
      status: 'completed',
      triggeringMessageId: 'root-2',
    })
    conversations.createBranch({
      activate: true,
      conversationId: 'conversation-1',
      createdAt: '2026-08-14T00:00:08.000Z',
      forkedFromMessageId: 'root-2',
      id: 'branch-child',
      parentBranchId: 'branch-root',
    })
    runs.create({
      branchId: 'branch-child',
      completedAt: '2026-08-14T00:00:09.500Z',
      conversationId: 'conversation-1',
      errorCode: 'AUTHENTICATION_REQUIRED',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      id: 'compact-child',
      model: 'model-1',
      piSessionFile: '/tmp/session.jsonl',
      provider: 'provider-1',
      purpose: 'conversation.compaction',
      startedAt: '2026-08-14T00:00:09.000Z',
      status: 'failed',
      triggeringMessageId: 'root-2',
    })
    conversations.createMessage({
      branchId: 'branch-child',
      content: { text: 'child' },
      conversationId: 'conversation-1',
      createdAt: '2026-08-14T00:00:10.000Z',
      id: 'child-1',
      role: 'user',
      runId: null,
    })

    const newest = conversations.listTimelinePage('conversation-1', 'branch-child', {
      limit: 3,
    })
    expect(newest.items.map(item => `${item.kind}:${item.id}`)).toEqual([
      'message:root-2',
      'compaction:compact-child',
      'message:child-1',
    ])
    expect(newest.nextBefore).toMatchObject({
      branchId: 'branch-root',
      id: 'root-2',
      kind: 'message',
      occurredAt: '2026-08-14T00:00:04.000Z',
    })

    const oldest = conversations.listTimelinePage('conversation-1', 'branch-child', {
      before: newest.nextBefore,
      limit: 3,
    })
    expect(oldest.items.map(item => `${item.kind}:${item.id}`)).toEqual([
      'message:root-1',
      'compaction:compact-visible',
    ])
    expect(oldest.items[1]).toMatchObject({
      estimatedTokensAfter: 700,
      kind: 'compaction',
      tokensBefore: 1400,
    })
    expect(oldest.nextBefore).toBeNull()
    expect(oldest.items.some(item => item.id === 'compact-hidden')).toBe(false)
  })

  it('extends a timeline page across branch lineage through the triggering user message', () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    const conversations = createConversationRepository(database)
    const runs = createRunRepository(database)
    conversations.create({
      branchId: 'branch-1',
      createdAt: '2026-08-14T00:00:00.000Z',
      approvalPolicy: 'policy',
      executionProfile: 'workspace_write',
      id: 'conversation-1',
      spaceId: null,
      title: null,
    })
    conversations.createMessage({
      branchId: 'branch-1',
      content: { text: 'older' },
      conversationId: 'conversation-1',
      createdAt: '2026-08-14T00:00:01.000Z',
      id: 'message-older',
      role: 'user',
      runId: null,
    })
    conversations.createMessage({
      branchId: 'branch-1',
      content: { text: 'trigger' },
      conversationId: 'conversation-1',
      createdAt: '2026-08-14T00:00:02.000Z',
      id: 'message-trigger',
      role: 'user',
      runId: null,
    })
    conversations.createBranch({
      activate: true,
      conversationId: 'conversation-1',
      createdAt: '2026-08-14T00:00:02.500Z',
      forkedFromMessageId: 'message-trigger',
      id: 'branch-child',
      parentBranchId: 'branch-1',
    })
    runs.create({
      branchId: 'branch-child',
      conversationId: 'conversation-1',
      approvalPolicy: 'policy',
      executionProfile: 'workspace_write',
      id: 'run-1',
      model: 'model-1',
      piSessionFile: '/tmp/session.jsonl',
      provider: 'provider-1',
      purpose: 'chat',
      startedAt: '2026-08-14T00:00:03.000Z',
      status: 'running',
      triggeringMessageId: 'message-trigger',
    })
    const insertMessage = database.prepare(`
      INSERT INTO messages (
        id, conversation_id, branch_id, run_id, role, content_json, created_at
      ) VALUES (?, 'conversation-1', 'branch-child', 'run-1', 'assistant', ?, ?)
    `)
    const base = Date.parse('2026-08-14T00:00:04.000Z')
    for (let index = 0; index < 220; index += 1) {
      insertMessage.run(
        `reply-${index.toString().padStart(3, '0')}`,
        JSON.stringify({ text: `${index}` }),
        new Date(base + index).toISOString(),
      )
    }

    const newest = conversations.listTimelinePage('conversation-1', 'branch-child', {
      limit: 100,
    })

    expect(newest.items).toHaveLength(221)
    expect(newest.items[0]).toMatchObject({
      id: 'message-trigger',
      kind: 'message',
      role: 'user',
    })
    expect(newest.nextBefore).toMatchObject({
      id: 'message-trigger',
      kind: 'message',
    })
    expect(conversations.listTimelinePage('conversation-1', 'branch-child', {
      before: newest.nextBefore,
      limit: 100,
    }).items.map(item => item.id)).toEqual(['message-older'])
  })

  it('rejects a timeline turn that exceeds the bounded page expansion', () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    const conversations = createConversationRepository(database)
    const runs = createRunRepository(database)
    conversations.create({
      branchId: 'branch-1',
      createdAt: '2026-08-14T00:00:00.000Z',
      approvalPolicy: 'policy',
      executionProfile: 'workspace_write',
      id: 'conversation-1',
      spaceId: null,
      title: null,
    })
    conversations.createMessage({
      branchId: 'branch-1',
      content: { text: 'trigger' },
      conversationId: 'conversation-1',
      createdAt: '2026-08-14T00:00:01.000Z',
      id: 'message-trigger',
      role: 'user',
      runId: null,
    })
    runs.create({
      branchId: 'branch-1',
      conversationId: 'conversation-1',
      approvalPolicy: 'policy',
      executionProfile: 'workspace_write',
      id: 'run-1',
      model: 'model-1',
      piSessionFile: '/tmp/session.jsonl',
      provider: 'provider-1',
      purpose: 'chat',
      startedAt: '2026-08-14T00:00:02.000Z',
      status: 'running',
      triggeringMessageId: 'message-trigger',
    })
    const insertMessage = database.prepare(`
      INSERT INTO messages (
        id, conversation_id, branch_id, run_id, role, content_json, created_at
      ) VALUES (?, 'conversation-1', 'branch-1', 'run-1', 'assistant', ?, ?)
    `)
    const base = Date.parse('2026-08-14T00:00:03.000Z')
    for (let index = 0; index < 1_000; index += 1) {
      insertMessage.run(
        `reply-${index.toString().padStart(4, '0')}`,
        JSON.stringify({ text: `${index}` }),
        new Date(base + index).toISOString(),
      )
    }

    expect(() => conversations.listTimelinePage('conversation-1', 'branch-1', {
      limit: 100,
    })).toThrow('turn exceeds timeline page limit')
  })

  it('bounds tool-heavy history pages without dropping stored messages', () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    const conversations = createConversationRepository(database)
    conversations.create({
      branchId: 'branch-1',
      createdAt: '2026-09-01T00:00:00.000Z',
      approvalPolicy: 'policy',
      executionProfile: 'workspace_write',
      id: 'conversation-1',
      spaceId: null,
      title: null,
    })
    const insert = database.prepare(`
      INSERT INTO messages (id, conversation_id, branch_id, run_id, role, content_json, created_at)
      VALUES (?, 'conversation-1', 'branch-1', NULL, ?, ?, ?)
    `)
    const time = (index: number) => new Date(Date.parse('2026-09-01T00:00:00.000Z') + index).toISOString()
    for (let index = 0; index < 150; index++) {
      insert.run(`message-${index}`, index % 2 ? 'assistant' : 'user', JSON.stringify({ text: `${index}` }), time(index * 20))
      for (let tool = 1; tool <= 10; tool++)
        insert.run(`tool-${index}-${tool}`, 'tool', JSON.stringify({ text: 'stored tool result' }), time(index * 20 + tool))
    }

    let page = conversations.listTimelinePage('conversation-1', 'branch-1', { limit: 100 })
    const ids = page.items.map(item => item.id)
    expect(page.items).toHaveLength(100)
    for (let index = 0; page.nextBefore && index < 20; index++) {
      page = conversations.listTimelinePage('conversation-1', 'branch-1', { before: page.nextBefore, limit: 100 })
      expect(page.items.length).toBeLessThanOrEqual(100)
      ids.unshift(...page.items.map(item => item.id))
    }
    expect(page.nextBefore).toBeNull()
    const stored = conversations.listMessages('conversation-1', 'branch-1', 1650)
    expect(ids).toEqual(stored.map(message => message.id))
    expect(new Set(ids).size).toBe(1650)
    expect(stored.filter(message => message.role === 'tool')).toHaveLength(1500)
  })

  it('keeps 10k-item timeline pagination index-backed and boundary-stable', () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    const conversations = createConversationRepository(database)
    conversations.create({
      branchId: 'branch-1',
      createdAt: '2026-08-14T00:00:00.000Z',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      id: 'conversation-1',
      spaceId: null,
      title: null,
    })
    const insertMessage = database.prepare(`
      INSERT INTO messages (
        id, conversation_id, branch_id, run_id, role, content_json, created_at
      ) VALUES (?, 'conversation-1', 'branch-1', NULL, 'user', ?, ?)
    `)
    const insertRun = database.prepare(`
      INSERT INTO runs (
        id, conversation_id, branch_id, triggering_message_id, provider, model,
        purpose, status, pi_session_file, error_code, started_at, completed_at
      ) VALUES (
        ?, 'conversation-1', 'branch-1', 'message-00000', 'provider-1', 'model-1',
        'conversation.compaction', 'completed', '/tmp/session.jsonl', NULL, ?, ?
      )
    `)
    const insertEvent = database.prepare(`
      INSERT INTO run_events (run_id, sequence, event_type, payload_json, created_at)
      VALUES (?, 1, 'context.compaction.completed', ?, ?)
    `)
    const expected: Array<{ id: string, kind: 'compaction' | 'message', occurredAt: string }> = []
    const base = Date.parse('2026-08-14T00:00:00.000Z')
    database.exec('BEGIN IMMEDIATE')
    try {
      for (let index = 0; index < 9_900; index += 1) {
        const id = `message-${index.toString().padStart(5, '0')}`
        const occurredAt = new Date(base + index * 10).toISOString()
        insertMessage.run(id, JSON.stringify({ text: `${index}` }), occurredAt)
        expected.push({ id, kind: 'message', occurredAt })
      }
      for (let index = 0; index < 100; index += 1) {
        const id = `compact-${index.toString().padStart(3, '0')}`
        const occurredAt = new Date(base + index * 990 + 5).toISOString()
        insertRun.run(id, occurredAt, occurredAt)
        insertEvent.run(
          id,
          JSON.stringify({ estimatedTokensAfter: 500, tokensBefore: 1_000 }),
          occurredAt,
        )
        expected.push({ id, kind: 'compaction', occurredAt })
      }
      database.exec('COMMIT')
    }
    catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
    expected.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))

    const newest = conversations.listTimelinePage('conversation-1', 'branch-1', {
      limit: 100,
    })
    const older = conversations.listTimelinePage('conversation-1', 'branch-1', {
      before: newest.nextBefore,
      limit: 100,
    })
    expect(newest.items.map(item => ({ id: item.id, kind: item.kind })))
      .toEqual(expected.slice(-100).map(({ id, kind }) => ({ id, kind })))
    expect(older.items.map(item => ({ id: item.id, kind: item.kind })))
      .toEqual(expected.slice(-200, -100).map(({ id, kind }) => ({ id, kind })))
    expect(new Set([
      ...newest.items.map(item => item.id),
      ...older.items.map(item => item.id),
    ])).toHaveLength(200)

    const plan = database.prepare(`
      EXPLAIN QUERY PLAN
      WITH timeline AS (
        SELECT id, created_at AS occurred_at, 0 AS sort_rank
        FROM messages
        WHERE conversation_id = ? AND branch_id = ?
        UNION ALL
        SELECT id, started_at AS occurred_at, 1 AS sort_rank
        FROM runs
        WHERE conversation_id = ? AND branch_id = ?
          AND purpose = 'conversation.compaction'
      )
      SELECT * FROM timeline
      ORDER BY occurred_at DESC, sort_rank DESC, id DESC
      LIMIT ?
    `).all('conversation-1', 'branch-1', 'conversation-1', 'branch-1', 101) as Array<{
      detail: string
    }>
    expect(plan.some(row => row.detail.includes('idx_messages_conversation_branch'))).toBe(true)
    expect(plan.some(row => row.detail.includes('idx_runs_conversation_branch'))).toBe(true)
  })

  it('activates an owned branch and rejects foreign branches', () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    const conversations = createConversationRepository(database)
    conversations.create({
      branchId: 'branch-root',
      createdAt: '2026-08-14T00:00:00.000Z',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      id: 'conversation-1',
      spaceId: null,
      title: null,
    })
    conversations.createBranch({
      activate: true,
      conversationId: 'conversation-1',
      createdAt: '2026-08-14T00:00:01.000Z',
      forkedFromMessageId: null,
      id: 'branch-second',
      parentBranchId: null,
    })
    conversations.create({
      branchId: 'branch-foreign',
      createdAt: '2026-08-14T00:00:00.000Z',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      id: 'conversation-2',
      spaceId: null,
      title: null,
    })

    expect(conversations.activateBranch({
      branchId: 'branch-root',
      conversationId: 'conversation-1',
      updatedAt: '2026-08-15T00:00:00.000Z',
    })).toMatchObject({
      activeBranchId: 'branch-root',
      id: 'conversation-1',
      updatedAt: '2026-08-15T00:00:00.000Z',
    })
    expect(() => conversations.activateBranch({
      branchId: 'branch-foreign',
      conversationId: 'conversation-1',
      updatedAt: '2026-08-15T00:00:01.000Z',
    })).toThrow(/branch is not activatable/i)
  })

  it('does not switch branches while a conversation run is incomplete', () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    const conversations = createConversationRepository(database)
    const runs = createRunRepository(database)
    conversations.create({
      branchId: 'branch-root',
      createdAt: '2026-08-14T00:00:00.000Z',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      id: 'conversation-1',
      spaceId: null,
      title: null,
    })
    conversations.createBranch({
      activate: false,
      conversationId: 'conversation-1',
      createdAt: '2026-08-14T00:00:01.000Z',
      forkedFromMessageId: null,
      id: 'branch-second',
      parentBranchId: null,
    })
    conversations.createMessage({
      branchId: 'branch-root',
      content: { text: 'hello' },
      conversationId: 'conversation-1',
      createdAt: '2026-08-14T00:00:02.000Z',
      id: 'message-1',
      role: 'user',
      runId: null,
    })
    runs.create({
      branchId: 'branch-root',
      conversationId: 'conversation-1',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      id: 'run-1',
      model: 'model-1',
      piSessionFile: null,
      provider: 'provider-1',
      purpose: 'chat',
      startedAt: '2026-08-14T00:00:03.000Z',
      status: 'running',
      triggeringMessageId: 'message-1',
    })

    expect(() => conversations.activateBranch({
      branchId: 'branch-second',
      conversationId: 'conversation-1',
      updatedAt: '2026-08-15T00:00:00.000Z',
    })).toThrow(/branch is not activatable/i)
    expect(conversations.findById('conversation-1')?.activeBranchId).toBe('branch-root')
  })
})
