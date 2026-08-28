import type { BuddyDataPaths } from '../storage/BuddyDataPaths'
import type {
  CapturedFileStateRecord,
  ChangeSetRecord,
  ChangeSetRepository,
  FileChangeCaptureRecord,
} from './changeSetRepository'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { redactSensitiveText } from '../../../shared/approvalReviewPayload'
import { resolveGrantedPath } from '../projects/resolveGrantedPath'

const MAX_CHANGE_TEXT_BYTES = 1024 * 1024
const MAX_CHANGE_HASH_BYTES = 32 * 1024 * 1024

interface FileToolInput {
  canonicalRoot: string
  conversationId: string
  runId: string
  toolCallId: string
  toolName: 'edit' | 'write'
}

export interface LocalChangeSetSummary {
  changeSetId: string
  conversationId: string
  coverage: 'complete' | 'partial'
  fileCount: number
  runId: string
  status: 'capturing' | 'completed'
  updatedAt: string
}

export interface LocalFileChangeDetail {
  afterSizeBytes: number | null
  afterText: string | null
  beforeSizeBytes: number | null
  beforeText: string | null
  changeType: 'created' | 'deleted' | 'modified'
  id: string
  language: string | null
  path: string
  preview: 'binary' | 'oversized' | 'sensitive' | 'text' | 'unavailable'
  redacted: boolean
}

export interface LocalChangeSetDetail extends LocalChangeSetSummary {
  files: LocalFileChangeDetail[]
}

export class ChangeCaptureService {
  readonly #paths: BuddyDataPaths
  readonly #repository: ChangeSetRepository

  constructor(options: { paths: BuddyDataPaths, repository: ChangeSetRepository }) {
    this.#paths = options.paths
    this.#repository = options.repository
  }

  async beginFileTool(input: FileToolInput & { arguments: unknown }): Promise<void> {
    const requestedPath = readToolPath(input.arguments)
    const absolutePath = isAbsolute(requestedPath)
      ? requestedPath
      : resolve(input.canonicalRoot, requestedPath)
    const resolution = await resolveGrantedPath([{
      canonicalRoot: input.canonicalRoot,
      projectId: input.conversationId,
      root: input.canonicalRoot,
    }], absolutePath, input.toolName === 'write' ? 'create' : 'existing')
    const captureId = randomUUID()
    const relativePath = displayRelativePath(input.canonicalRoot, resolution.canonicalPath)
    const before = await this.#captureState({
      absolutePath: resolution.canonicalPath,
      captureId,
      conversationId: input.conversationId,
      relativePath,
      runId: input.runId,
      side: 'before',
    })
    const now = new Date().toISOString()
    this.#ensureSet(input.runId, input.conversationId, now)
    this.#repository.createCapture({
      after: null,
      before,
      changeSetId: input.runId,
      completedAt: null,
      createdAt: now,
      id: captureId,
      relativePath,
      status: 'pending',
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      toolReportedError: null,
    })
  }

  async finishFileTool(input: FileToolInput & { isError: boolean }): Promise<void> {
    const capture = this.#repository.findCaptureByToolCallId(input.toolCallId)
    if (!capture || capture.changeSetId !== input.runId)
      return
    const requestedPath = resolve(input.canonicalRoot, capture.relativePath)
    const resolution = await resolveGrantedPath([{
      canonicalRoot: input.canonicalRoot,
      projectId: input.conversationId,
      root: input.canonicalRoot,
    }], requestedPath, 'create')
    const after = await this.#captureState({
      absolutePath: resolution.canonicalPath,
      captureId: capture.id,
      conversationId: input.conversationId,
      relativePath: capture.relativePath,
      runId: input.runId,
      side: 'after',
    })
    const now = new Date().toISOString()
    this.#repository.completeCapture(capture.id, after, input.isError, now)
    this.#refreshFileCount(input.runId, now)
  }

  async markPartial(input: { conversationId: string, runId: string }): Promise<void> {
    const now = new Date().toISOString()
    this.#ensureSet(input.runId, input.conversationId, now)
    this.#repository.markPartial(input.runId, now)
  }

  async markInterrupted(runId: string): Promise<void> {
    const changeSet = this.#repository.findSetById(runId)
    if (!changeSet)
      return
    const now = new Date().toISOString()
    this.#repository.markPartial(runId, now)
    const captures = this.#repository.listCaptures(runId)
    this.#repository.finalizeSet(runId, aggregateCaptures(captures).length, now)
  }

  async finalizeRun(runId: string): Promise<void> {
    const changeSet = this.#repository.findSetById(runId)
    if (!changeSet)
      return
    const captures = this.#repository.listCaptures(runId)
    if (captures.some(capture => capture.status === 'pending'))
      this.#repository.markPartial(runId, new Date().toISOString())
    const now = new Date().toISOString()
    this.#repository.finalizeSet(runId, aggregateCaptures(captures).length, now)
  }

  listSummariesForRuns(runIds: readonly string[]): LocalChangeSetSummary[] {
    return this.#repository.listSetsForRuns(runIds)
      .filter(changeSet => changeSet.fileCount > 0 || changeSet.coverage === 'partial')
      .map(toSummary)
  }

  async getVisibleDetail(changeSetId: string): Promise<LocalChangeSetDetail> {
    const changeSet = this.#repository.findVisibleSetById(changeSetId)
    if (!changeSet)
      throw new ChangeCaptureError('CHANGE_SET_NOT_FOUND')
    const files = await Promise.all(aggregateCaptures(
      this.#repository.listCaptures(changeSetId),
    ).map(change => this.#toFileDetail(change)))
    return { ...toSummary(changeSet), files }
  }

  #ensureSet(runId: string, conversationId: string, now: string): ChangeSetRecord {
    return this.#repository.ensureSet({
      conversationId,
      coverage: 'complete',
      createdAt: now,
      fileCount: 0,
      id: runId,
      runId,
      status: 'capturing',
      updatedAt: now,
    })
  }

  #refreshFileCount(changeSetId: string, now: string): void {
    const count = aggregateCaptures(this.#repository.listCaptures(changeSetId)).length
    this.#repository.updateFileCount(changeSetId, count, now)
  }

  async #captureState(input: {
    absolutePath: string
    captureId: string
    conversationId: string
    relativePath: string
    runId: string
    side: 'after' | 'before'
  }): Promise<CapturedFileStateRecord> {
    let metadata
    try {
      metadata = await stat(input.absolutePath)
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return emptyState('missing')
      return emptyState('unavailable')
    }
    if (!metadata.isFile())
      return emptyState('unavailable')
    const sizeBytes = metadata.size
    if (sizeBytes > MAX_CHANGE_HASH_BYTES) {
      return {
        hash: null,
        kind: 'oversized',
        redacted: false,
        sizeBytes,
        snapshotPath: null,
      }
    }
    const bytes = await readFile(input.absolutePath)
    const hash = createHash('sha256').update(bytes).digest('hex')
    if (isSensitivePath(input.relativePath)) {
      return { hash, kind: 'sensitive', redacted: false, sizeBytes, snapshotPath: null }
    }
    if (sizeBytes > MAX_CHANGE_TEXT_BYTES) {
      return { hash, kind: 'oversized', redacted: false, sizeBytes, snapshotPath: null }
    }
    const text = decodeText(bytes)
    if (text === null)
      return { hash, kind: 'binary', redacted: false, sizeBytes, snapshotPath: null }
    const redacted = redactSensitiveText(text)
    const snapshotPath = this.#paths.changeSnapshot(
      input.conversationId,
      input.runId,
      input.captureId,
      input.side,
    )
    await mkdir(this.#paths.conversationChangesDirectory(input.conversationId, input.runId), {
      mode: 0o700,
      recursive: true,
    })
    await writeFile(snapshotPath, redacted, { flag: 'wx', mode: 0o600 })
    return { hash, kind: 'text', redacted: redacted !== text, sizeBytes, snapshotPath }
  }

  async #toFileDetail(change: AggregatedChange): Promise<LocalFileChangeDetail> {
    let preview = resolvePreview(change.before, change.after)
    let beforeText: string | null = null
    let afterText: string | null = null
    if (preview === 'text') {
      [beforeText, afterText] = await Promise.all([
        readSnapshot(change.before),
        readSnapshot(change.after),
      ])
      if (beforeText === null || afterText === null) {
        preview = 'unavailable'
        beforeText = null
        afterText = null
      }
    }
    return {
      afterSizeBytes: change.after.sizeBytes,
      afterText,
      beforeSizeBytes: change.before.sizeBytes,
      beforeText,
      changeType: change.before.kind === 'missing'
        ? 'created'
        : change.after.kind === 'missing'
          ? 'deleted'
          : 'modified',
      id: change.first.id,
      language: languageFromPath(change.relativePath),
      path: change.relativePath,
      preview,
      redacted: change.before.redacted || change.after.redacted,
    }
  }
}

interface AggregatedChange {
  after: CapturedFileStateRecord
  before: CapturedFileStateRecord
  first: FileChangeCaptureRecord
  relativePath: string
}

function aggregateCaptures(captures: readonly FileChangeCaptureRecord[]): AggregatedChange[] {
  const groups = new Map<string, FileChangeCaptureRecord[]>()
  for (const capture of captures) {
    const group = groups.get(capture.relativePath) ?? []
    group.push(capture)
    groups.set(capture.relativePath, group)
  }
  return [...groups].flatMap(([relativePath, group]) => {
    const first = group[0]
    const last = group.at(-1)
    if (!first || !last)
      return []
    const after = last.after ?? emptyState('unavailable')
    if (sameState(first.before, after))
      return []
    return [{ after, before: first.before, first, relativePath }]
  })
}

function sameState(left: CapturedFileStateRecord, right: CapturedFileStateRecord): boolean {
  if (left.kind !== right.kind || left.sizeBytes !== right.sizeBytes)
    return false
  if (left.kind === 'missing')
    return true
  return left.hash !== null && left.hash === right.hash
}

function emptyState(kind: 'missing' | 'unavailable'): CapturedFileStateRecord {
  return { hash: null, kind, redacted: false, sizeBytes: null, snapshotPath: null }
}

function displayRelativePath(canonicalRoot: string, path: string): string {
  const result = relative(canonicalRoot, path)
  if (!result || result === '..' || result.startsWith(`..${sep}`))
    throw new ChangeCaptureError('PATH_OUTSIDE_GRANTED_DIRECTORY')
  return result.split(sep).join('/')
}

function readToolPath(value: unknown): string {
  const path = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>).path
    : null
  if (typeof path !== 'string' || !path.trim())
    throw new ChangeCaptureError('VALIDATION_FAILED')
  return path
}

function decodeText(bytes: Uint8Array): string | null {
  if (bytes.includes(0))
    return null
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  }
  catch {
    return null
  }
}

function isSensitivePath(path: string): boolean {
  const name = basename(path).toLowerCase()
  const extension = extname(name)
  return name === '.env'
    || name.startsWith('.env.')
    || ['.credential', '.key', '.p12', '.pem'].includes(extension)
    || ['id_dsa', 'id_ecdsa', 'id_ed25519', 'id_rsa'].includes(name)
}

function resolvePreview(
  before: CapturedFileStateRecord,
  after: CapturedFileStateRecord,
): LocalFileChangeDetail['preview'] {
  const kinds = new Set([before.kind, after.kind])
  if (kinds.has('sensitive'))
    return 'sensitive'
  if (kinds.has('unavailable'))
    return 'unavailable'
  if (kinds.has('oversized'))
    return 'oversized'
  if (kinds.has('binary'))
    return 'binary'
  return 'text'
}

async function readSnapshot(state: CapturedFileStateRecord): Promise<string | null> {
  if (state.kind === 'missing')
    return ''
  if (state.kind !== 'text' || !state.snapshotPath)
    return null
  try {
    return await readFile(state.snapshotPath, 'utf8')
  }
  catch {
    return null
  }
}

function languageFromPath(path: string): string | null {
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
  ]).get(path.split('.').at(-1)?.toLowerCase() ?? '') ?? null
}

function toSummary(changeSet: ChangeSetRecord): LocalChangeSetSummary {
  return {
    changeSetId: changeSet.id,
    conversationId: changeSet.conversationId,
    coverage: changeSet.coverage,
    fileCount: changeSet.fileCount,
    runId: changeSet.runId,
    status: changeSet.status,
    updatedAt: changeSet.updatedAt,
  }
}

export class ChangeCaptureError extends Error {
  readonly code: string

  constructor(code: string) {
    super('Lexora Buddy change capture failed')
    this.name = 'ChangeCaptureError'
    this.code = code
  }
}
