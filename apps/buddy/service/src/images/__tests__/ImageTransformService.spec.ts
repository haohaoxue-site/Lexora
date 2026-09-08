import type { DatabaseSync } from 'node:sqlite'
import { Buffer } from 'node:buffer'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveBuddyImageTransformer } from '../../../../platform/native/nativeHost'
import { ArtifactService } from '../../artifacts/ArtifactService'

import { prepareTestTurnRequest } from '../../storage/__tests__/composerDraftTestFixture'
import { createArtifactRepository } from '../../storage/artifactRepository'
import { openBuddyDatabase } from '../../storage/database'
import { ImageTransformService } from '../ImageTransformService'
import { runNativeImage } from '../runNativeImage'

const databases: DatabaseSync[] = []
const directories: string[] = []

beforeEach(() => {
  vi.stubEnv('LEXORA_BUDDY_IMAGE_TRANSFORMER', resolveBuddyImageTransformer({ appPath: join(import.meta.dirname, '../../../..'), isPackaged: false, resourcesPath: '' }))
})

afterEach(async () => {
  for (const database of databases.splice(0))
    database.close()
  await Promise.all(directories.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

describe('imageTransformService', () => {
  it('removes a chroma background into a new PNG while preserving dimensions and lineage', async () => {
    const root = await mkdtemp(join(tmpdir(), 'buddy-image-transform-'))
    directories.push(root)
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    seedRun(database)
    const artifacts = new ArtifactService({ repository: createArtifactRepository(database) })
    const grants = [{ canonicalRoot: root, grantId: 'workspace-1', kind: 'workspace' as const, root }]
    const sourceBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAFElEQVR4AQEJAPb/AAD/AP//AAD/EPgD/UE7EkoAAAAASUVORK5CYII=', 'base64')
    const [source] = await artifacts.registerGeneratedImages({
      conversationId: 'conversation-1',
      cwd: root,
      grants,
      images: [{ bytes: sourceBytes, mimeType: 'image/png' }],
      outputPath: '绿幕.png',
      sourceArtifactId: null,
    })
    const service = new ImageTransformService({ artifacts })

    const transformed = await service.removeChroma({
      color: '#00ff00',
      conversationId: 'conversation-1',
      cwd: root,
      despill: 1,
      grants,
      outputPath: '透明头像.png',
      softness: 20,
      sourceArtifactId: source!.id,
      tolerance: 10,
    })

    expect(transformed).toMatchObject({
      mimeType: 'image/png',
      name: '透明头像.png',
      sourceArtifactId: source!.id,
    })
    const derived = await artifacts.materializeConversationArtifact(
      'conversation-1',
      transformed.id,
    )
    const metadata = await runNativeImage(derived.bytes, { operation: 'validate', options: { mimeType: 'image/png' } })
    expect(JSON.parse(Buffer.from(metadata).toString('utf8'))).toEqual({ width: 2, height: 1, mimeType: 'image/png' })
    const original = await artifacts.materializeConversationArtifact('conversation-1', source!.id)
    expect(Buffer.from(original.bytes)).toEqual(sourceBytes)
    expect(Buffer.from(derived.bytes)).not.toEqual(sourceBytes)
  })
})

function seedRun(database: DatabaseSync): void {
  prepareTestTurnRequest(database, {
    attachmentBindings: [],
    branchId: 'branch-1',
    conversationId: 'conversation-1',
    createdAt: '2026-08-31T00:00:00.000Z',
    approvalPolicy: 'policy' as const,
    executionProfile: 'workspace_write',
    model: 'model-1',
    spaceId: null,
    provider: 'provider-1',
    requestFingerprint: 'fingerprint-1',
    requestId: 'request-1',
    runId: 'run-1',
    runInput: {
      attachmentIds: [],
      contextItems: [],
      prompt: 'hello',
      reasoning: null,
      serviceTier: null,
    },
    title: 'Conversation',
    userMessageContent: { attachmentIds: [], text: 'hello' },
    userMessageId: 'message-1',
  })
}
