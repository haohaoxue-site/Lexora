import type { ImageContent } from '@earendil-works/pi-ai'
import type { Buffer } from 'node:buffer'
import type { BuddyAttachmentUpload } from '../../../shared/attachmentPolicy'
import type { AttachmentRecord, AttachmentRepository } from '../storage/attachmentRepository'
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, copyFile, mkdir, readFile, realpath, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import {
  BUDDY_ATTACHMENT_COUNT_LIMIT,
  BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT,
} from '../../../shared/attachmentPolicy'

const MAX_TEXT_PROMPT_BYTES = 1024 * 1024
const MIME_TYPES: Readonly<Record<string, string>> = {
  '.csv': 'text/csv',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.png': 'image/png',
  '.toml': 'application/toml',
  '.tsv': 'text/tab-separated-values',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
  '.xml': 'application/xml',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
}
const SUPPORTED_IMAGE_MIME_TYPES = new Set(
  Object.values(MIME_TYPES).filter(mimeType => mimeType.startsWith('image/')),
)

export interface AttachmentServiceOptions {
  directory: string
  readFile?: AttachmentFileReader
  repository: AttachmentRepository
}

export interface AttachmentFileReader {
  (path: string): Promise<Buffer>
  (path: string, encoding: 'utf8'): Promise<string>
}

export interface AttachmentRecoveryResult {
  images: ImageContent[]
  missingAttachmentIds: string[]
}

export class AttachmentService {
  readonly #directory: string
  readonly #readFile: AttachmentFileReader
  readonly #repository: AttachmentRepository

  constructor(options: AttachmentServiceOptions) {
    this.#directory = options.directory
    this.#readFile = options.readFile ?? readFile
    this.#repository = options.repository
  }

  async registerFiles(paths: readonly string[]): Promise<AttachmentRecord[]> {
    if (paths.length > BUDDY_ATTACHMENT_COUNT_LIMIT)
      throw new AttachmentError('VALIDATION_FAILED')
    const sources = await Promise.all(paths.map(async (selectedPath) => {
      const sourcePath = await realpath(selectedPath).catch(() => null)
      if (!sourcePath)
        throw new AttachmentError('ATTACHMENT_NOT_FOUND')
      const metadata = await stat(sourcePath)
      if (!metadata.isFile() || metadata.size > BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT)
        throw new AttachmentError('VALIDATION_FAILED')
      const mimeType = inferMimeType(sourcePath)
      if (!isSupportedAttachment(mimeType, metadata.size))
        throw new AttachmentError('VALIDATION_FAILED')
      return { metadata, mimeType, sourcePath }
    }))
    validateTotalBytes(sources.map(source => source.metadata.size))
    await mkdir(this.#directory, { mode: 0o700, recursive: true })
    const records: AttachmentRecord[] = []
    const attempted: AttachmentRecord[] = []
    try {
      for (const { metadata, mimeType, sourcePath } of sources) {
        const id = randomUUID()
        const extension = safeExtension(sourcePath)
        const storedPath = join(this.#directory, `${id}${extension}`)
        const record: AttachmentRecord = {
          conversationId: null,
          createdAt: new Date().toISOString(),
          draftKey: null,
          id,
          mimeType,
          name: basename(sourcePath),
          sizeBytes: metadata.size,
          status: 'draft',
          storedPath,
        }
        attempted.push(record)
        await copyFile(sourcePath, storedPath, constants.COPYFILE_EXCL)
        await chmod(storedPath, 0o600)
        this.#repository.create(record)
        records.push(record)
      }
    }
    catch (error) {
      await this.#rollbackRegistration(attempted)
      throw error
    }
    return records
  }

  async registerUploads(uploads: readonly BuddyAttachmentUpload[]): Promise<AttachmentRecord[]> {
    if (uploads.length > BUDDY_ATTACHMENT_COUNT_LIMIT)
      throw new AttachmentError('VALIDATION_FAILED')
    const sources = uploads.map((upload) => {
      const name = basename(upload.name.trim())
      const mimeType = upload.mimeType.trim() || inferMimeType(name)
      if (
        !name
        || upload.bytes.byteLength > BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT
        || !isSupportedAttachment(mimeType, upload.bytes.byteLength)
      ) {
        throw new AttachmentError('VALIDATION_FAILED')
      }
      return { ...upload, mimeType, name }
    })
    validateTotalBytes(sources.map(source => source.bytes.byteLength))
    await mkdir(this.#directory, { mode: 0o700, recursive: true })
    const records: AttachmentRecord[] = []
    const attempted: AttachmentRecord[] = []
    try {
      for (const source of sources) {
        const id = randomUUID()
        const storedPath = join(this.#directory, `${id}${safeExtension(source.name)}`)
        const record: AttachmentRecord = {
          conversationId: null,
          createdAt: new Date().toISOString(),
          draftKey: null,
          id,
          mimeType: source.mimeType,
          name: source.name,
          sizeBytes: source.bytes.byteLength,
          status: 'draft',
          storedPath,
        }
        attempted.push(record)
        await writeFile(storedPath, source.bytes, { flag: 'wx', mode: 0o600 })
        await chmod(storedPath, 0o600)
        this.#repository.create(record)
        records.push(record)
      }
    }
    catch (error) {
      await this.#rollbackRegistration(attempted)
      throw error
    }
    return records
  }

  resolvePreview(id: string): { mimeType: string, path: string } {
    const record = this.#requireAvailable(id)
    if (!record.mimeType.startsWith('image/'))
      throw new AttachmentError('VALIDATION_FAILED')
    return { mimeType: record.mimeType, path: record.storedPath }
  }

  async release(ids: readonly string[]): Promise<string[]> {
    const released: string[] = []
    for (const id of ids) {
      const record = this.#repository.findById(id)
      if (!record || record.status !== 'draft')
        continue
      await unlinkAvailableFile(record.storedPath)
      if (this.#repository.release([id]) === 1) {
        released.push(id)
      }
    }
    return released
  }

  cleanupDrafts(retainedIds: readonly string[]): Promise<string[]> {
    const retained = new Set(retainedIds)
    return this.release(this.#repository.listDrafts()
      .filter(record => !retained.has(record.id))
      .map(record => record.id))
  }

  async deleteForConversation(conversationId: string): Promise<string[]> {
    const records = this.#repository.listForConversation(conversationId)
    for (const record of records) {
      try {
        await unlink(record.storedPath)
      }
      catch (error) {
        if (!isFileNotFound(error))
          throw error
      }
    }
    return records.map(record => record.id)
  }

  listForConversation(conversationId: string): AttachmentRecord[] {
    return this.#repository.listForConversation(conversationId)
      .filter(record => record.status === 'attached')
  }

  async materializePrompt(
    ids: readonly string[],
    content: string,
    conversationId: string | null = null,
  ): Promise<{ images: ImageContent[], prompt: string, records: AttachmentRecord[] }> {
    const records = ids.map(id => this.#requireForPrompt(id, conversationId))
    validateTotalBytes(records.map(record => record.sizeBytes))
    const materialized = await Promise.all(records.map(async (record): Promise<{
      image: ImageContent | null
      section: string
    }> => {
      try {
        if (record.mimeType.startsWith('image/') && record.mimeType !== 'image/svg+xml') {
          return {
            image: {
              data: (await this.#readFile(record.storedPath)).toString('base64'),
              mimeType: record.mimeType,
              type: 'image',
            },
            section: `附件：${record.name}（图像）`,
          }
        }
        if (!isTextAttachment(record) || record.sizeBytes > MAX_TEXT_PROMPT_BYTES)
          throw new AttachmentError('VALIDATION_FAILED')
        const text = await this.#readFile(record.storedPath, 'utf8')
        return { image: null, section: `附件：${record.name}\n\n${text}` }
      }
      catch (error) {
        if (error instanceof AttachmentError)
          throw error
        if (isFileNotFound(error))
          throw new AttachmentError('ATTACHMENT_NOT_FOUND', { cause: error })
        throw error
      }
    }))
    return {
      images: materialized.flatMap(item => item.image ? [item.image] : []),
      prompt: [content.trim(), ...materialized.map(item => item.section)]
        .filter(Boolean)
        .join('\n\n---\n\n'),
      records,
    }
  }

  async materializeRecoveryImages(
    ids: readonly string[],
    conversationId: string,
  ): Promise<AttachmentRecoveryResult> {
    const resolved = ids.map((id) => {
      try {
        return { id, record: this.#requireForPrompt(id, conversationId) }
      }
      catch (error) {
        if (error instanceof AttachmentError && error.code === 'ATTACHMENT_NOT_FOUND')
          return { id, record: null }
        throw error
      }
    })
    validateTotalBytes(resolved.flatMap(item => item.record ? [item.record.sizeBytes] : []))
    const recovered = await Promise.all(resolved.map(async ({ id, record }) => {
      if (!record)
        return { images: [], missingAttachmentId: id }
      try {
        const { images } = await this.materializePrompt([id], '', conversationId)
        return { images, missingAttachmentId: null }
      }
      catch (error) {
        if (error instanceof AttachmentError && error.code === 'ATTACHMENT_NOT_FOUND')
          return { images: [], missingAttachmentId: id }
        throw error
      }
    }))
    return {
      images: recovered.flatMap(item => item.images),
      missingAttachmentIds: recovered.flatMap(
        item => item.missingAttachmentId ? [item.missingAttachmentId] : [],
      ),
    }
  }

  attach(ids: readonly string[], conversationId: string): void {
    if (ids.length > 0 && this.#repository.attach(ids, conversationId) !== ids.length)
      throw new AttachmentError('ATTACHMENT_NOT_FOUND')
  }

  #requireAvailable(id: string): AttachmentRecord {
    const record = this.#repository.findById(id)
    if (!record || record.status === 'released')
      throw new AttachmentError('ATTACHMENT_NOT_FOUND')
    return record
  }

  #requireForPrompt(id: string, conversationId: string | null): AttachmentRecord {
    const record = this.#requireAvailable(id)
    if (record.status === 'draft')
      return record
    if (record.status === 'attached' && record.conversationId === conversationId)
      return record
    throw new AttachmentError('VALIDATION_FAILED')
  }

  async #rollbackRegistration(records: readonly AttachmentRecord[]): Promise<void> {
    for (const record of records.toReversed()) {
      try {
        await unlinkAvailableFile(record.storedPath)
      }
      catch {
        continue
      }
      try {
        this.#repository.remove(record.id)
      }
      catch {}
    }
  }
}

function validateTotalBytes(sizes: readonly number[]): void {
  if (sizes.reduce((total, size) => total + size, 0) > BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT)
    throw new AttachmentError('VALIDATION_FAILED')
}

export class AttachmentError extends Error {
  readonly code: string

  constructor(code: string, options?: ErrorOptions) {
    super('Lexora Buddy attachment operation failed', options)
    this.name = 'AttachmentError'
    this.code = code
  }
}

function safeExtension(path: string): string {
  const extension = extname(path).toLowerCase()
  return /^\.[a-z0-9]{1,16}$/.test(extension) ? extension : ''
}

function isTextAttachment(record: AttachmentRecord): boolean {
  return isTextMimeType(record.mimeType)
}

function isTextMimeType(mimeType: string): boolean {
  return mimeType.startsWith('text/') || new Set([
    'application/json',
    'application/toml',
    'application/xml',
    'application/yaml',
  ]).has(mimeType)
}

function isSupportedAttachment(mimeType: string, sizeBytes: number): boolean {
  if (SUPPORTED_IMAGE_MIME_TYPES.has(mimeType))
    return true
  return isTextMimeType(mimeType) && sizeBytes <= MAX_TEXT_PROMPT_BYTES
}

function inferMimeType(path: string): string {
  const extension = extname(path).toLowerCase()
  return MIME_TYPES[extension] ?? 'application/octet-stream'
}

function isFileNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
}

async function unlinkAvailableFile(path: string): Promise<void> {
  try {
    await unlink(path)
  }
  catch (error) {
    if (!isFileNotFound(error))
      throw error
  }
}
