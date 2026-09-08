import type { DatabaseSync } from 'node:sqlite'
import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createAttachmentRepository } from '../../storage/attachmentRepository'
import { BuddyDataPaths } from '../../storage/BuddyDataPaths'
import { openBuddyDatabase } from '../../storage/database'
import { AttachmentService } from '../AttachmentService'

const databases: DatabaseSync[] = []
const directories: string[] = []

afterEach(async () => {
  for (const database of databases.splice(0))
    database.close()
  await Promise.all(directories.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

describe('attachment ownership', () => {
  it('stages a draft snapshot under the destination message and can roll it back', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lexora-buddy-input-'))
    directories.push(root)
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    const paths = new BuddyDataPaths(root)
    const service = new AttachmentService({
      paths,
      repository: createAttachmentRepository(database),
    })
    const [attachment] = await service.registerUploads('draft-1', [{
      bytes: Uint8Array.from([1, 2, 3]),
      mimeType: 'image/png',
      name: 'source.png',
    }])

    const staged = await service.prepareMessageAttachments({
      attachmentIds: [attachment!.id],
      conversationId: 'conversation-1',
      draftId: 'draft-1',
      messageId: 'message-1',
    })

    expect(attachment).toMatchObject({ draftId: 'draft-1', messageId: null })
    expect(attachment!.storedPath.startsWith(paths.draftAttachments('draft-1'))).toBe(true)

    expect(staged.bindings).toEqual([
      expect.objectContaining({
        id: attachment!.id,
        messageId: 'message-1',
        storedPath: expect.stringContaining('/conversations/conversation-1/inputs/message-1/'),
      }),
    ])
    await expect(readFile(staged.bindings[0]!.storedPath)).resolves.toEqual(Buffer.from([1, 2, 3]))

    await staged.rollback()

    await expect(readFile(staged.bindings[0]!.storedPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(attachment!.storedPath)).resolves.toEqual(Buffer.from([1, 2, 3]))
  })

  it('removes unpublished files while preserving and reporting database-owned files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lexora-buddy-reconcile-'))
    directories.push(root)
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    const paths = new BuddyDataPaths(root)
    const service = new AttachmentService({
      paths,
      repository: createAttachmentRepository(database),
    })
    const [available, missing, damaged] = await service.registerUploads('draft-1', [
      { bytes: Uint8Array.of(1), mimeType: 'text/plain', name: 'available.txt' },
      { bytes: Uint8Array.of(2), mimeType: 'text/plain', name: 'missing.txt' },
      { bytes: Uint8Array.of(3), mimeType: 'text/plain', name: 'damaged.txt' },
    ])
    await unlink(missing!.storedPath)
    await writeFile(damaged!.storedPath, Uint8Array.of(3, 4))
    const orphanDirectory = paths.draftAttachments('orphan-draft')
    await mkdir(orphanDirectory, { recursive: true })
    await Promise.all([
      writeFile(join(orphanDirectory, 'orphan.txt'), 'orphan'),
      writeFile(join(orphanDirectory, 'interrupted.txt.part'), 'partial'),
    ])

    const receipt = await service.reconcileStorage()

    expect(receipt).toEqual({
      invalidAttachmentIds: [damaged!.id],
      missingAttachmentIds: [missing!.id],
      removedOrphanFiles: 2,
    })
    await expect(readFile(available!.storedPath)).resolves.toEqual(Buffer.from([1]))
    await expect(readdir(orphanDirectory)).resolves.toEqual([])
  })
})
