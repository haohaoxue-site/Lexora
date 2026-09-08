import type { DatabaseSync } from 'node:sqlite'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createRunEventLog } from '../../events/createRunEventLog'
import { prepareTestTurnRequest } from '../../storage/__tests__/composerDraftTestFixture'
import { createAttachmentRepository } from '../../storage/attachmentRepository'
import { createConversationDirectoryGrantRepository } from '../../storage/conversationDirectoryGrantRepository'
import { createConversationRepository } from '../../storage/conversationRepository'
import { openBuddyDatabase } from '../../storage/database'
import { ConversationLifecycleService } from '../ConversationLifecycleService'

const databases: DatabaseSync[] = []
const directories: string[] = []

afterEach(async () => {
  for (const database of databases.splice(0))
    database.close()
  await Promise.all(directories.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

describe('conversationLifecycleService', () => {
  it('hides the conversation while preserving product history and usage-owned files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lexora-buddy-conversation-'))
    directories.push(root)
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    const conversations = createConversationRepository(database)
    const directoryGrants = createConversationDirectoryGrantRepository(database)
    prepareTestTurnRequest(database, {
      attachmentBindings: [],
      branchId: 'branch-1',
      conversationId: 'conversation-1',
      createdAt: '2026-08-14T00:00:00.000Z',
      model: 'model-1',
      spaceId: null,
      provider: 'provider-1',
      requestFingerprint: 'fingerprint-1',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      requestId: 'request-1',
      runInput: {
        attachmentIds: [],
        contextItems: [],
        prompt: 'hello',
        reasoning: null,
        serviceTier: null,
      },
      runId: 'run-1',
      title: null,
      userMessageContent: { text: 'hello' },
      userMessageId: 'message-1',
    })
    directoryGrants.grant({
      canonicalRoot: '/external',
      conversationId: 'conversation-1',
      createdAt: '2026-08-14T00:00:01.000Z',
      id: 'grant-1',
      root: '/external',
    })
    const attachmentsRepository = createAttachmentRepository(database)
    const attachmentPath = join(root, 'attachment.txt')
    await writeFile(attachmentPath, 'attachment')
    attachmentsRepository.create({
      conversationId: 'conversation-1',
      createdAt: '2026-08-14T00:00:00.000Z',
      draftId: null,
      id: 'attachment-1',
      messageId: 'message-1',
      mimeType: 'text/plain',
      name: 'attachment.txt',
      sizeBytes: 10,
      storedPath: attachmentPath,
    })
    const conversationsDirectory = join(root, 'conversations')
    const eventLog = createRunEventLog({ conversationsDirectory, database })
    await eventLog.append({ payload: {}, runId: 'run-1', type: 'run.started' })
    const sessionDirectory = join(
      conversationsDirectory,
      'conversation-1',
      'session',
      'branch-1',
    )
    await mkdir(sessionDirectory, { recursive: true })
    await writeFile(join(sessionDirectory, 'session.jsonl'), '{}\n')
    const cancelled = vi.fn(async () => 1)
    const invalidated = vi.fn(async () => 1)
    const service = new ConversationLifecycleService({
      conversations,
      directoryGrants,
      runner: { cancelAndWaitForConversation: cancelled },
      sessions: { invalidateConversation: invalidated },
    })

    await expect(service.delete('conversation-1')).resolves.toBe(true)
    expect(cancelled).toHaveBeenCalledBefore(invalidated)
    expect(conversations.findById('conversation-1')).not.toBeNull()
    expect(conversations.listRecent()).toEqual([])
    expect(attachmentsRepository.findVisibleById('attachment-1')).toBeNull()
    await expect(readFile(
      join(conversationsDirectory, 'conversation-1', 'events', 'run-1.jsonl'),
      'utf8',
    )).resolves.toContain('run.started')
    await expect(readFile(attachmentPath, 'utf8')).resolves.toBe('attachment')
    await expect(readFile(join(sessionDirectory, 'session.jsonl'), 'utf8')).resolves.toBe('{}\n')
    expect(database.prepare('SELECT COUNT(*) AS count FROM runs').get()).toEqual({ count: 1 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM run_events').get()).toEqual({ count: 1 })
    expect(conversations.findById('conversation-1')?.deletedAt).toEqual(expect.any(String))
    expect(directoryGrants.listActive('conversation-1')).toEqual([])
    await expect(service.delete('conversation-1')).resolves.toBe(false)
    expect(conversations.findById('conversation-1')).not.toBeNull()
    expect(conversations.listRecent()).toEqual([])
  })

  it('revokes conversation grants before asynchronous run cancellation', async () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    const conversations = createConversationRepository(database)
    const directoryGrants = createConversationDirectoryGrantRepository(database)
    conversations.create({
      branchId: 'branch-1',
      createdAt: '2026-08-14T00:00:00.000Z',
      approvalPolicy: 'policy' as const,
      executionProfile: 'workspace_write',
      id: 'conversation-cancellation-failure',
      spaceId: null,
      title: null,
    })
    directoryGrants.grant({
      canonicalRoot: '/external',
      conversationId: 'conversation-cancellation-failure',
      createdAt: '2026-08-14T00:00:01.000Z',
      id: 'grant-1',
      root: '/external',
    })
    const invalidated = vi.fn(async () => 0)
    const service = new ConversationLifecycleService({
      conversations,
      directoryGrants,
      runner: {
        cancelAndWaitForConversation: vi.fn(async () => {
          throw new Error('cancellation failed')
        }),
      },
      sessions: { invalidateConversation: invalidated },
    })

    await expect(service.delete('conversation-cancellation-failure')).rejects.toThrow(
      'cancellation failed',
    )
    expect(directoryGrants.listActive('conversation-cancellation-failure')).toEqual([])
    expect(invalidated).not.toHaveBeenCalled()
  })
})
