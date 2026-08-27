import type { ImageContent } from '@earendil-works/pi-ai'
import type { Buffer } from 'node:buffer'
import type { BuddyAttachmentUpload } from '../../../shared/attachmentPolicy'
import type { AttachmentRecord, AttachmentRepository } from '../storage/attachmentRepository'
import type { BuddyDataPaths } from '../storage/BuddyDataPaths'
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, copyFile, mkdir, readFile, realpath, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import {
  BUDDY_ATTACHMENT_COUNT_LIMIT,
  BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT,
} from '../../../shared/attachmentPolicy'

const DRAFT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
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
  paths: BuddyDataPaths
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

export interface MessageAttachmentBinding {
  createdAt: string
  id: string
  messageId: string
  mimeType: string
  name: string
  sizeBytes: number
  sourceAttachmentId: string
  sourceDraftId: string | null
  sourceStoredPath: string
  storedPath: string
}

export interface PreparedMessageAttachments {
  bindings: readonly MessageAttachmentBinding[]
  commit: () => Promise<void>
  rollback: () => Promise<void>
}

export class AttachmentService {
  readonly #paths: BuddyDataPaths
  readonly #readFile: AttachmentFileReader
  readonly #repository: AttachmentRepository

  constructor(options: AttachmentServiceOptions) {
    this.#paths = options.paths
    this.#readFile = options.readFile ?? readFile
    this.#repository = options.repository
  }

  async registerFiles(draftId: string, paths: readonly string[]): Promise<AttachmentRecord[]> {
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
    const directory = this.#paths.draftAttachments(draftId)
    await mkdir(directory, { mode: 0o700, recursive: true })
    const records: AttachmentRecord[] = []
    const attempted: AttachmentRecord[] = []
    try {
      for (const { metadata, mimeType, sourcePath } of sources) {
        const id = randomUUID()
        const storedPath = join(directory, `${id}${safeExtension(sourcePath)}`)
        const record: AttachmentRecord = {
          conversationId: null,
          createdAt: new Date().toISOString(),
          draftId,
          id,
          messageId: null,
          mimeType,
          name: basename(sourcePath),
          sizeBytes: metadata.size,
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

  async registerUploads(
    draftId: string,
    uploads: readonly BuddyAttachmentUpload[],
  ): Promise<AttachmentRecord[]> {
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
    const directory = this.#paths.draftAttachments(draftId)
    await mkdir(directory, { mode: 0o700, recursive: true })
    const records: AttachmentRecord[] = []
    const attempted: AttachmentRecord[] = []
    try {
      for (const source of sources) {
        const id = randomUUID()
        const storedPath = join(directory, `${id}${safeExtension(source.name)}`)
        const record: AttachmentRecord = {
          conversationId: null,
          createdAt: new Date().toISOString(),
          draftId,
          id,
          messageId: null,
          mimeType: source.mimeType,
          name: source.name,
          sizeBytes: source.bytes.byteLength,
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

  async prepareMessageAttachments(input: {
    attachmentIds: readonly string[]
    conversationId: string
    draftId: string
    messageId: string
  }): Promise<PreparedMessageAttachments> {
    const records = input.attachmentIds.map(id => this.#requireForPrompt(
      id,
      input.conversationId,
      input.draftId,
    ))
    validateTotalBytes(records.map(record => record.sizeBytes))
    if (records.length === 0) {
      return {
        bindings: [],
        commit: () => Promise.resolve(),
        rollback: () => Promise.resolve(),
      }
    }
    const directory = this.#paths.messageInputs(input.conversationId, input.messageId)
    await mkdir(directory, { mode: 0o700, recursive: true })
    const bindings: MessageAttachmentBinding[] = []
    try {
      for (const record of records) {
        const id = record.draftId === input.draftId ? record.id : randomUUID()
        const storedPath = join(directory, `${id}${safeExtension(record.name)}`)
        await copyFile(record.storedPath, storedPath, constants.COPYFILE_EXCL)
        await chmod(storedPath, 0o600)
        bindings.push({
          createdAt: new Date().toISOString(),
          id,
          messageId: input.messageId,
          mimeType: record.mimeType,
          name: record.name,
          sizeBytes: record.sizeBytes,
          sourceAttachmentId: record.id,
          sourceDraftId: record.draftId,
          sourceStoredPath: record.storedPath,
          storedPath,
        })
      }
    }
    catch (error) {
      await removeFiles(bindings.map(binding => binding.storedPath))
      throw error
    }
    return {
      bindings,
      commit: () => removeFiles(bindings.flatMap(
        binding => binding.sourceDraftId ? [binding.sourceStoredPath] : [],
      )),
      rollback: () => removeFiles(bindings.map(binding => binding.storedPath)),
    }
  }

  resolvePreview(id: string): { mimeType: string, path: string } {
    const record = this.#repository.findVisibleById(id)
    if (!record)
      throw new AttachmentError('ATTACHMENT_NOT_FOUND')
    if (!record.mimeType.startsWith('image/'))
      throw new AttachmentError('VALIDATION_FAILED')
    return { mimeType: record.mimeType, path: record.storedPath }
  }

  async release(ids: readonly string[]): Promise<string[]> {
    const released: string[] = []
    for (const id of ids) {
      const record = this.#repository.findById(id)
      if (!record?.draftId)
        continue
      await unlinkAvailableFile(record.storedPath)
      if (this.#repository.removeDraft(id))
        released.push(id)
    }
    return released
  }

  cleanupDrafts(now = Date.now()): Promise<string[]> {
    const cutoff = new Date(now - DRAFT_RETENTION_MS).toISOString()
    return this.release(this.#repository.listDraftsBefore(cutoff).map(record => record.id))
  }

  listForConversation(conversationId: string): AttachmentRecord[] {
    return this.#repository.listForConversation(conversationId)
  }

  async materializeConversationImages(
    conversationId: string,
    ids?: readonly string[],
  ): Promise<{ images: ImageContent[], records: AttachmentRecord[] }> {
    const available = this.listForConversation(conversationId)
      .filter(record => record.mimeType.startsWith('image/'))
    const selectedIds = ids === undefined
      ? available.slice(-1).map(record => record.id)
      : ids
    if (selectedIds.length === 0)
      throw new AttachmentError('ATTACHMENT_NOT_FOUND')
    const materialized = await this.materializePrompt(selectedIds, '', conversationId)
    if (materialized.images.length !== selectedIds.length)
      throw new AttachmentError('VALIDATION_FAILED')
    return {
      images: materialized.images,
      records: materialized.records,
    }
  }

  async materializePrompt(
    ids: readonly string[],
    content: string,
    conversationId: string | null = null,
    draftId: string | null = null,
  ): Promise<{ images: ImageContent[], prompt: string, records: AttachmentRecord[] }> {
    const records = ids.map(id => this.#requireForPrompt(id, conversationId, draftId))
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
            section: `附件：${record.name}（图像，attachmentId=${record.id}）`,
          }
        }
        if (!isTextAttachment(record) || record.sizeBytes > MAX_TEXT_PROMPT_BYTES)
          throw new AttachmentError('VALIDATION_FAILED')
        const text = await this.#readFile(record.storedPath, 'utf8')
        return {
          image: null,
          section: `附件：${record.name}（attachmentId=${record.id}）\n\n${text}`,
        }
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
        return { id, record: this.#requireForPrompt(id, conversationId, null) }
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

  #requireAvailable(id: string): AttachmentRecord {
    const record = this.#repository.findById(id)
    if (!record)
      throw new AttachmentError('ATTACHMENT_NOT_FOUND')
    return record
  }

  #requireForPrompt(
    id: string,
    conversationId: string | null,
    draftId: string | null,
  ): AttachmentRecord {
    const record = this.#requireAvailable(id)
    if (record.draftId !== null) {
      if (record.draftId === draftId)
        return record
      throw new AttachmentError('VALIDATION_FAILED')
    }
    if (record.messageId !== null && record.conversationId === conversationId)
      return record
    throw new AttachmentError('VALIDATION_FAILED')
  }

  async #rollbackRegistration(records: readonly AttachmentRecord[]): Promise<void> {
    for (const record of records.toReversed()) {
      await unlinkAvailableFile(record.storedPath).catch(() => undefined)
      try {
        this.#repository.removeDraft(record.id)
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

async function removeFiles(paths: readonly string[]): Promise<void> {
  await Promise.all(paths.map(unlinkAvailableFile))
}
