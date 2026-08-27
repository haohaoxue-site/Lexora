import type { ImageContent } from '@earendil-works/pi-ai'
import type { ArtifactRecord, ArtifactRepository } from '../storage/artifactRepository'
import type { BuddyDataPaths } from '../storage/BuddyDataPaths'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

export interface ArtifactUpload {
  bytes: Uint8Array
  mimeType: string
  name: string
}

export class ArtifactService {
  readonly #paths: BuddyDataPaths
  readonly #repository: ArtifactRepository

  constructor(options: { paths: BuddyDataPaths, repository: ArtifactRepository }) {
    this.#paths = options.paths
    this.#repository = options.repository
  }

  async registerGeneratedImages(input: {
    conversationId: string
    images: readonly ArtifactUpload[]
    runId: string
    sourceArtifactId: string | null
    sourceToolCallId: string
  }): Promise<ArtifactRecord[]> {
    const records: ArtifactRecord[] = []
    const attemptedPaths: string[] = []
    try {
      for (const image of input.images) {
        if (!image.mimeType.startsWith('image/') || image.bytes.byteLength === 0)
          throw new ArtifactError('VALIDATION_FAILED')
        const id = randomUUID()
        const name = basename(image.name.trim())
        if (!name)
          throw new ArtifactError('VALIDATION_FAILED')
        const directory = this.#paths.conversationArtifactsDirectory(input.conversationId)
        const storedPath = join(directory, createArtifactStorageName(id, name, image.mimeType))
        attemptedPaths.push(storedPath)
        const record: ArtifactRecord = {
          conversationId: input.conversationId,
          createdAt: new Date().toISOString(),
          id,
          mimeType: image.mimeType,
          name,
          runId: input.runId,
          sizeBytes: image.bytes.byteLength,
          sourceArtifactId: input.sourceArtifactId,
          sourceToolCallId: input.sourceToolCallId,
          storedPath,
        }
        await mkdir(directory, { mode: 0o700, recursive: true })
        await writeFile(storedPath, image.bytes, { flag: 'wx', mode: 0o600 })
        await chmod(storedPath, 0o600)
        this.#repository.create(record)
        records.push(record)
      }
      return records
    }
    catch (error) {
      await Promise.all(attemptedPaths.map(path => unlink(path).catch(() => undefined)))
      throw error
    }
  }

  resolvePreview(id: string): { mimeType: string, path: string } {
    const artifact = this.#repository.findVisibleById(id)
    if (!artifact || !artifact.mimeType.startsWith('image/'))
      throw new ArtifactError('VALIDATION_FAILED')
    return { mimeType: artifact.mimeType, path: artifact.storedPath }
  }

  async materializeConversationImages(
    conversationId: string,
    ids?: readonly string[],
  ): Promise<{ images: ImageContent[], records: ArtifactRecord[] }> {
    const available = this.#repository.listForConversation(conversationId)
      .filter(record => record.mimeType.startsWith('image/'))
    const selected = ids === undefined
      ? available.slice(-1)
      : ids.map((id) => {
          const artifact = this.#repository.findById(id)
          if (
            !artifact
            || artifact.conversationId !== conversationId
            || !artifact.mimeType.startsWith('image/')
          ) {
            throw new ArtifactError('ARTIFACT_NOT_FOUND')
          }
          return artifact
        })
    const images = await Promise.all(selected.map(async (artifact): Promise<ImageContent> => ({
      data: (await readFile(artifact.storedPath)).toString('base64'),
      mimeType: artifact.mimeType,
      type: 'image',
    })))
    return { images, records: selected }
  }
}

export class ArtifactError extends Error {
  readonly code: string

  constructor(code: string) {
    super('Lexora Buddy artifact operation failed')
    this.name = 'ArtifactError'
    this.code = code
  }
}

function normalizeArtifactName(name: string, mimeType: string): string {
  const extension = safeExtension(name) || extensionForMimeType(mimeType)
  const rawStem = extension ? name.slice(0, -extension.length) : name
  const normalizedStem = replaceUnsafeFileNameCharacters(rawStem.normalize('NFC'))
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
  return `${truncateUtf8(normalizedStem, 200) || 'artifact'}${extension}`
}

function replaceUnsafeFileNameCharacters(value: string): string {
  const reserved = '<>:"/\\|?*'
  return [...value].map((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || codePoint === 127 || reserved.includes(character)
      ? '-'
      : character
  }).join('')
}

function createArtifactStorageName(id: string, name: string, mimeType: string): string {
  const normalizedName = normalizeArtifactName(name, mimeType)
  const extension = safeExtension(normalizedName) || extensionForMimeType(mimeType)
  const stem = (extension ? normalizedName.slice(0, -extension.length) : normalizedName)
    .slice(0, 190) || 'artifact'
  const shortId = id.replaceAll('-', '').slice(0, 12)
  return `${stem}-${shortId}${extension}`
}

function safeExtension(name: string): string {
  const extension = extname(name).toLowerCase()
  return /^\.[a-z0-9]{1,16}$/.test(extension) ? extension : ''
}

function extensionForMimeType(mimeType: string): string {
  return new Map([
    ['image/gif', '.gif'],
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
  ]).get(mimeType) ?? ''
}

function truncateUtf8(value: string, maxBytes: number): string {
  let result = ''
  for (const character of value) {
    if (Buffer.byteLength(result + character) > maxBytes)
      break
    result += character
  }
  return result
}
