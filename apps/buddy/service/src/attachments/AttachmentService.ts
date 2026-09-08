import type { ImageContent } from '@earendil-works/pi-ai'
import type { Buffer } from 'node:buffer'
import type { BuddyAttachmentUpload } from '../../../shared/attachmentPolicy'
import type { BuddyPromptDirective, BuddyUserContentV1 } from '../../../shared/buddyUserContent'
import type { AttachmentRecord, AttachmentRepository } from '../storage/attachmentRepository'
import type { BuddyDataPaths } from '../storage/BuddyDataPaths'
import type { AttachmentImageReference } from './AttachmentImageReference'
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, copyFile, mkdir, open, readdir, readFile, realpath, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, normalize } from 'node:path'
import { fileStorage } from '../../../platform/fileStorage'
import {
  BUDDY_ATTACHMENT_COUNT_LIMIT,
  BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT,
  BUDDY_TEXT_ATTACHMENT_EXTENSIONS,
} from '../../../shared/attachmentPolicy'
import { projectBuddyUserContent } from '../../../shared/buddyUserContentProjection'

export const DRAFT_ATTACHMENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const { replace: rename, syncDirectory } = fileStorage
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
const textExtensions = new Set<string>(BUDDY_TEXT_ATTACHMENT_EXTENSIONS)

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
  images: AttachmentImageReference[]
  missingAttachmentIds: string[]
}

export interface AttachmentStorageReconciliation {
  invalidAttachmentIds: string[]
  missingAttachmentIds: string[]
  removedOrphanFiles: number
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

  async registerFiles(
    draftId: string,
    paths: readonly string[],
    limits = {
      count: BUDDY_ATTACHMENT_COUNT_LIMIT,
      errorCode: 'VALIDATION_FAILED',
      totalBytes: BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT,
    },
  ): Promise<AttachmentRecord[]> {
    if (paths.length > limits.count)
      throw new AttachmentError(limits.errorCode)
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
    validateTotalBytes(sources.map(source => source.metadata.size), limits.totalBytes, limits.errorCode)
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
        await publishFile(sourcePath, storedPath)
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
        await publishBytes(source.bytes, storedPath)
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
        await publishFile(record.storedPath, storedPath)
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

  cleanupDrafts(now = Date.now(), retainedAttachmentIds: ReadonlySet<string> = new Set()): Promise<string[]> {
    const cutoff = new Date(now - DRAFT_ATTACHMENT_RETENTION_MS).toISOString()
    return this.release(this.#repository.listDraftsBefore(cutoff)
      .filter(record => !retainedAttachmentIds.has(record.id))
      .map(record => record.id))
  }

  async reconcileStorage(): Promise<AttachmentStorageReconciliation> {
    const records = this.#repository.listAll()
    const ownedPaths = new Set(records.map(record => normalize(record.storedPath)))
    const invalidAttachmentIds: string[] = []
    const missingAttachmentIds: string[] = []

    for (const record of records) {
      try {
        const metadata = await stat(record.storedPath)
        if (!metadata.isFile() || metadata.size !== record.sizeBytes)
          invalidAttachmentIds.push(record.id)
      }
      catch (error) {
        if (isFileNotFound(error)) {
          missingAttachmentIds.push(record.id)
          continue
        }
        throw error
      }
    }

    const roots = [this.#paths.draftsDirectory]
    const conversationDirectories = await listDirectories(this.#paths.conversationsDirectory)
    roots.push(...conversationDirectories.map(directory => join(directory, 'inputs')))
    let removedOrphanFiles = 0
    for (const root of roots) {
      for (const path of await listFilesRecursively(root)) {
        if (ownedPaths.has(normalize(path)))
          continue
        await unlinkAvailableFile(path)
        removedOrphanFiles += 1
      }
    }

    return {
      invalidAttachmentIds: invalidAttachmentIds.sort(),
      missingAttachmentIds: missingAttachmentIds.sort(),
      removedOrphanFiles,
    }
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
    composer?: { content: BuddyUserContentV1, resourceIds: readonly string[], resolveDirective?: (directive: BuddyPromptDirective) => string },
  ): Promise<{ images: ImageContent[], prompt: string, records: AttachmentRecord[] }> {
    const prepared = await this.preparePrompt(ids, content, conversationId, draftId, composer)
    return {
      images: await this.materializePiInputImages(
        prepared.imageReferences,
        conversationId,
        draftId,
      ),
      prompt: prepared.prompt,
      records: prepared.records,
    }
  }

  async preparePrompt(
    ids: readonly string[],
    content: string,
    conversationId: string | null = null,
    draftId: string | null = null,
    composer?: { content: BuddyUserContentV1, resourceIds: readonly string[], resolveDirective?: (directive: BuddyPromptDirective) => string },
  ): Promise<{ imageReferences: AttachmentImageReference[], prompt: string, records: AttachmentRecord[] }> {
    const records = ids.map(id => this.#requireForPrompt(id, conversationId, draftId))
    validateTotalBytes(records.map(record => record.sizeBytes))
    const materialized = await Promise.all(records.map(async (record): Promise<{
      imageReference: AttachmentImageReference | null
      section: string
      text: string | null
    }> => {
      try {
        if (record.mimeType.startsWith('image/') && record.mimeType !== 'image/svg+xml') {
          return {
            imageReference: toImageReference(record),
            section: `附件：${record.name}（图像，attachmentId=${record.id}）`,
            text: null,
          }
        }
        if (!isTextAttachment(record) || record.sizeBytes > MAX_TEXT_PROMPT_BYTES)
          throw new AttachmentError('VALIDATION_FAILED')
        const text = await this.#readFile(record.storedPath, 'utf8')
        return {
          imageReference: null,
          section: `附件：${record.name}（attachmentId=${record.id}）\n\n${text}`,
          text,
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
    const projected = composer
      ? projectBuddyUserContent(composer.content, (resourceId) => {
          const index = composer.resourceIds.indexOf(resourceId)
          const record = records[index]
          const value = materialized[index]
          if (!record || !value)
            throw new AttachmentError('ATTACHMENT_NOT_FOUND')
          return value.imageReference
            ? { kind: 'image', name: record.name }
            : { kind: 'text', name: record.name, text: value.text! }
        }, (directive) => {
          if (!composer.resolveDirective)
            throw new AttachmentError('VALIDATION_FAILED')
          return composer.resolveDirective(directive)
        })
      : null
    return {
      imageReferences: materialized.flatMap(item => item.imageReference ? [item.imageReference] : []),
      prompt: [projected?.prompt ?? content.trim(), ...materialized.slice(composer?.resourceIds.length ?? 0).map(item => item.section)]
        .filter(Boolean)
        .join('\n\n---\n\n'),
      records,
    }
  }

  async resolvePiInputImageReferences(
    ids: readonly string[],
    conversationId: string,
  ): Promise<AttachmentImageReference[]> {
    const records = ids.map(id => this.#requireForPrompt(id, conversationId, null))
    validateTotalBytes(records.map(record => record.sizeBytes))
    return records.flatMap(record => (
      record.mimeType.startsWith('image/') && record.mimeType !== 'image/svg+xml'
        ? [toImageReference(record)]
        : []
    ))
  }

  async materializePiInputImages(
    references: readonly AttachmentImageReference[],
    conversationId: string | null,
    draftId: string | null = null,
  ): Promise<ImageContent[]> {
    const records = references.map((reference) => {
      const record = this.#requireForPrompt(reference.attachmentId, conversationId, draftId)
      if (
        record.mimeType !== reference.mimeType
        || !record.mimeType.startsWith('image/')
        || record.mimeType === 'image/svg+xml'
      ) {
        throw new AttachmentError('VALIDATION_FAILED')
      }
      return record
    })
    validateTotalBytes(records.map(record => record.sizeBytes))
    return Promise.all(records.map(async (record) => {
      try {
        return {
          data: (await this.#readFile(record.storedPath)).toString('base64'),
          mimeType: record.mimeType,
          type: 'image' as const,
        }
      }
      catch (error) {
        if (isFileNotFound(error))
          throw new AttachmentError('ATTACHMENT_NOT_FOUND', { cause: error })
        throw error
      }
    }))
  }

  async resolveRecoveryInputImageReferences(
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
      if (!record.mimeType.startsWith('image/') || record.mimeType === 'image/svg+xml')
        return { images: [], missingAttachmentId: null }
      try {
        const metadata = await stat(record.storedPath)
        if (!metadata.isFile())
          return { images: [], missingAttachmentId: id }
        return { images: [toImageReference(record)], missingAttachmentId: null }
      }
      catch (error) {
        if (isFileNotFound(error))
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

function toImageReference(record: AttachmentRecord): AttachmentImageReference {
  return { attachmentId: record.id, mimeType: record.mimeType }
}

function validateTotalBytes(
  sizes: readonly number[],
  limit = BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT,
  errorCode = 'VALIDATION_FAILED',
): void {
  if (sizes.reduce((total, size) => total + size, 0) > limit)
    throw new AttachmentError(errorCode)
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

export function normalizeAttachmentMetadata(input: { mimeType: string, name: string, sizeBytes: number }) {
  const name = input.name.trim()
  const mimeType = textExtensions.has(extname(name).slice(1).toLowerCase())
    ? inferMimeType(name)
    : input.mimeType.trim() || inferMimeType(name)
  if (
    !name || /[/\\\0]/.test(name)
    || input.sizeBytes > BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT
    || !isSupportedAttachment(mimeType, input.sizeBytes)
  ) {
    throw new AttachmentError('VALIDATION_FAILED')
  }
  return { mimeType, name, sizeBytes: input.sizeBytes }
}

function inferMimeType(path: string): string {
  const extension = extname(path).toLowerCase()
  return MIME_TYPES[extension] ?? (textExtensions.has(extension.slice(1)) ? 'text/plain' : 'application/octet-stream')
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

async function publishBytes(bytes: Uint8Array, storedPath: string): Promise<void> {
  const temporaryPath = `${storedPath}.part`
  try {
    await writeFile(temporaryPath, bytes, { flag: 'wx', flush: true, mode: 0o600 })
    await rename(temporaryPath, storedPath)
    await syncDirectory(dirname(storedPath))
  }
  finally {
    await unlinkAvailableFile(temporaryPath)
  }
}

async function publishFile(sourcePath: string, storedPath: string): Promise<void> {
  const temporaryPath = `${storedPath}.part`
  try {
    await copyFile(sourcePath, temporaryPath, constants.COPYFILE_EXCL)
    await chmod(temporaryPath, 0o600)
    const file = await open(temporaryPath, 'r+')
    try {
      await file.sync()
    }
    finally {
      await file.close()
    }
    await rename(temporaryPath, storedPath)
    await syncDirectory(dirname(storedPath))
  }
  finally {
    await unlinkAvailableFile(temporaryPath)
  }
}

async function listDirectories(root: string): Promise<string[]> {
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => join(root, entry.name))
  }
  catch (error) {
    if (isFileNotFound(error))
      return []
    throw error
  }
}

async function listFilesRecursively(root: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  }
  catch (error) {
    if (isFileNotFound(error))
      return []
    throw error
  }
  const files: string[] = []
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory())
      files.push(...await listFilesRecursively(path))
    else if (entry.isFile())
      files.push(path)
  }
  return files
}
