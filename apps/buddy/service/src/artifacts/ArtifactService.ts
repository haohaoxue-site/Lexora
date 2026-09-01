import type { ImageContent } from '@earendil-works/pi-ai'
import type { DirectoryGrant } from '../directories/resolveGrantedPath'
import type { ArtifactRecord, ArtifactRepository } from '../storage/artifactRepository'
import type { BuddyDataPaths } from '../storage/BuddyDataPaths'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { basename, extname, isAbsolute, join, resolve } from 'node:path'
import { resolveGrantedPath } from '../directories/resolveGrantedPath'

export const BUDDY_ARTIFACT_COUNT_LIMIT = 16
export const BUDDY_ARTIFACT_TOTAL_BYTES_LIMIT = 32 * 1024 * 1024
export const BUDDY_ARTIFACT_TEXT_BYTES_LIMIT = 2 * 1024 * 1024

export interface ArtifactUpload {
  bytes: Uint8Array
  mimeType: string
  name: string
}

export type ArtifactResource = Omit<ArtifactRecord, 'storedPath'>

interface ArtifactRegistrationUpload extends ArtifactUpload {
  sourceArtifactId: string | null
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
    if (input.images.some(image => !image.mimeType.startsWith('image/')))
      throw new ArtifactError('VALIDATION_FAILED')
    return this.#registerUploads({
      allowEmpty: false,
      conversationId: input.conversationId,
      runId: input.runId,
      sourceToolCallId: input.sourceToolCallId,
      uploads: input.images.map(image => ({
        ...image,
        sourceArtifactId: input.sourceArtifactId,
      })),
    })
  }

  async registerFiles(input: {
    conversationId: string
    cwd: string
    files: readonly {
      outputName: string
      path: string
      sourceArtifactId?: string
    }[]
    grants: readonly DirectoryGrant[]
    runId: string
    sourceToolCallId: string
  }): Promise<ArtifactRecord[]> {
    if (input.files.length === 0 || input.files.length > BUDDY_ARTIFACT_COUNT_LIMIT)
      throw new ArtifactError('VALIDATION_FAILED')
    const uploads: ArtifactRegistrationUpload[] = []
    let totalBytes = 0
    for (const file of input.files) {
      const requestedPath = isAbsolute(file.path)
        ? file.path
        : resolve(input.cwd, file.path)
      const resolution = await resolveGrantedPath(input.grants, requestedPath, 'existing')
      const metadata = await stat(resolution.canonicalPath)
      if (!metadata.isFile())
        throw new ArtifactError('VALIDATION_FAILED')
      const sourceArtifactId = file.sourceArtifactId?.trim() || null
      if (sourceArtifactId)
        this.#requireConversationArtifact(input.conversationId, sourceArtifactId)
      totalBytes += metadata.size
      if (totalBytes > BUDDY_ARTIFACT_TOTAL_BYTES_LIMIT)
        throw new ArtifactError('ARTIFACT_SIZE_LIMIT')
      const outputName = requireArtifactOutputName(file.outputName, resolution.canonicalPath)
      uploads.push({
        bytes: await readFile(resolution.canonicalPath),
        mimeType: mimeTypeFromPath(resolution.canonicalPath),
        name: outputName,
        sourceArtifactId,
      })
    }
    return this.#registerUploads({
      allowEmpty: true,
      conversationId: input.conversationId,
      runId: input.runId,
      sourceToolCallId: input.sourceToolCallId,
      uploads,
    })
  }

  listConversationArtifacts(
    conversationId: string,
    limit = BUDDY_ARTIFACT_COUNT_LIMIT,
  ): ArtifactResource[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > BUDDY_ARTIFACT_COUNT_LIMIT)
      throw new ArtifactError('VALIDATION_FAILED')
    return this.#repository.listForConversation(conversationId)
      .slice(-limit)
      .reverse()
      .map(toArtifactResource)
  }

  async materializeConversationArtifact(
    conversationId: string,
    artifactId: string,
  ): Promise<{ bytes: Buffer, resource: ArtifactResource }> {
    const artifact = this.#requireConversationArtifact(conversationId, artifactId)
    return {
      bytes: await readFile(artifact.storedPath),
      resource: toArtifactResource(artifact),
    }
  }

  async checkoutConversationArtifact(input: {
    artifactId: string
    conversationId: string
    scratchGrant: DirectoryGrant
  }): Promise<{ path: string, resource: ArtifactResource }> {
    const artifact = this.#requireConversationArtifact(
      input.conversationId,
      input.artifactId,
    )
    const directory = join(input.scratchGrant.canonicalRoot, '.artifacts')
    await mkdir(directory, { mode: 0o700, recursive: true })
    const requestedPath = join(directory, `${randomUUID()}-${artifact.name}`)
    const resolution = await resolveGrantedPath(
      [input.scratchGrant],
      requestedPath,
      'create',
    )
    try {
      await copyFile(
        artifact.storedPath,
        resolution.canonicalPath,
        constants.COPYFILE_EXCL,
      )
      await chmod(resolution.canonicalPath, 0o600)
    }
    catch (error) {
      await unlink(resolution.canonicalPath).catch(() => undefined)
      throw error
    }
    return {
      path: resolution.canonicalPath,
      resource: toArtifactResource(artifact),
    }
  }

  async #registerUploads(input: {
    allowEmpty: boolean
    conversationId: string
    runId: string
    sourceToolCallId: string
    uploads: readonly ArtifactRegistrationUpload[]
  }): Promise<ArtifactRecord[]> {
    if (input.uploads.length === 0 || input.uploads.length > BUDDY_ARTIFACT_COUNT_LIMIT)
      throw new ArtifactError('VALIDATION_FAILED')
    const totalBytes = input.uploads.reduce((total, upload) => total + upload.bytes.byteLength, 0)
    if (totalBytes > BUDDY_ARTIFACT_TOTAL_BYTES_LIMIT)
      throw new ArtifactError('ARTIFACT_SIZE_LIMIT')
    const records: ArtifactRecord[] = []
    const attemptedPaths: string[] = []
    try {
      for (const upload of input.uploads) {
        if ((!input.allowEmpty && upload.bytes.byteLength === 0) || !upload.mimeType.trim())
          throw new ArtifactError('VALIDATION_FAILED')
        const id = randomUUID()
        const requestedName = upload.name.trim()
        if (!requestedName || basename(requestedName) !== requestedName)
          throw new ArtifactError('VALIDATION_FAILED')
        const name = normalizeArtifactName(requestedName, upload.mimeType)
        const directory = this.#paths.conversationArtifactsDirectory(input.conversationId)
        const storedPath = join(directory, createArtifactStorageName(id, name, upload.mimeType))
        attemptedPaths.push(storedPath)
        const record: ArtifactRecord = {
          conversationId: input.conversationId,
          createdAt: new Date().toISOString(),
          id,
          mimeType: upload.mimeType,
          name,
          runId: input.runId,
          sizeBytes: upload.bytes.byteLength,
          sourceArtifactId: upload.sourceArtifactId,
          sourceToolCallId: input.sourceToolCallId,
          storedPath,
        }
        await mkdir(directory, { mode: 0o700, recursive: true })
        await writeFile(storedPath, upload.bytes, { flag: 'wx', mode: 0o600 })
        await chmod(storedPath, 0o600)
        this.#repository.create(record)
        records.push(record)
      }
      return records
    }
    catch (error) {
      this.#repository.deleteByIds(records.map(record => record.id))
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

  async readText(id: string): Promise<{ artifactId: string, language: string | null, text: string }> {
    const artifact = this.#repository.findVisibleById(id)
    if (
      !artifact
      || !isTextArtifact(artifact.mimeType)
      || artifact.sizeBytes > BUDDY_ARTIFACT_TEXT_BYTES_LIMIT
    ) {
      throw new ArtifactError('VALIDATION_FAILED')
    }
    const bytes = await readFile(artifact.storedPath)
    if (bytes.byteLength > BUDDY_ARTIFACT_TEXT_BYTES_LIMIT)
      throw new ArtifactError('ARTIFACT_SIZE_LIMIT')
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    }
    catch {
      throw new ArtifactError('VALIDATION_FAILED')
    }
    return {
      artifactId: artifact.id,
      language: languageFromArtifactName(artifact.name),
      text,
    }
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

  #requireConversationArtifact(conversationId: string, artifactId: string): ArtifactRecord {
    const artifact = this.#repository.findVisibleById(artifactId)
    if (!artifact || artifact.conversationId !== conversationId)
      throw new ArtifactError('ARTIFACT_NOT_FOUND')
    return artifact
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

function requireArtifactOutputName(outputName: string, sourcePath: string): string {
  const trimmed = outputName.trim()
  if (!trimmed || basename(trimmed) !== trimmed || trimmed === '.' || trimmed === '..')
    throw new ArtifactError('VALIDATION_FAILED')
  const outputExtension = safeExtension(trimmed)
  const sourceExtension = safeExtension(basename(sourcePath))
  if (outputExtension && sourceExtension && outputExtension !== sourceExtension)
    throw new ArtifactError('VALIDATION_FAILED')
  if (outputExtension)
    return trimmed
  return `${trimmed}${sourceExtension}`
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
    ['image/svg+xml', '.svg'],
  ]).get(mimeType) ?? ''
}

function mimeTypeFromPath(path: string): string {
  return new Map([
    ['.css', 'text/css'],
    ['.csv', 'text/csv'],
    ['.gif', 'image/gif'],
    ['.html', 'text/html'],
    ['.jpeg', 'image/jpeg'],
    ['.jpg', 'image/jpeg'],
    ['.js', 'text/javascript'],
    ['.json', 'application/json'],
    ['.md', 'text/markdown'],
    ['.pdf', 'application/pdf'],
    ['.png', 'image/png'],
    ['.py', 'text/x-python'],
    ['.rs', 'text/x-rust'],
    ['.scss', 'text/x-scss'],
    ['.svg', 'image/svg+xml'],
    ['.toml', 'application/toml'],
    ['.ts', 'text/typescript'],
    ['.tsx', 'text/typescript-jsx'],
    ['.tsv', 'text/tab-separated-values'],
    ['.txt', 'text/plain'],
    ['.vue', 'text/x-vue'],
    ['.webp', 'image/webp'],
    ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['.xml', 'application/xml'],
    ['.yaml', 'application/yaml'],
    ['.yml', 'application/yaml'],
    ['.zip', 'application/zip'],
  ]).get(extname(path).toLowerCase()) ?? 'application/octet-stream'
}

function isTextArtifact(mimeType: string): boolean {
  return mimeType.startsWith('text/') || [
    'application/json',
    'application/toml',
    'application/xml',
    'application/yaml',
  ].includes(mimeType)
}

function languageFromArtifactName(name: string): string | null {
  return new Map([
    ['css', 'css'],
    ['html', 'html'],
    ['js', 'javascript'],
    ['json', 'javascript'],
    ['md', 'markdown'],
    ['py', 'python'],
    ['rs', 'rust'],
    ['scss', 'scss'],
    ['ts', 'typescript'],
    ['tsx', 'typescript'],
    ['vue', 'html'],
    ['xml', 'xml'],
    ['yaml', 'yaml'],
    ['yml', 'yaml'],
  ]).get(name.split('.').at(-1)?.toLowerCase() ?? '') ?? null
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

function toArtifactResource(record: ArtifactRecord): ArtifactResource {
  const { storedPath: _, ...resource } = record
  return resource
}
