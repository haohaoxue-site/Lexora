import type { DirectoryGrant } from '../directories/resolveGrantedPath'
import type { BuddyDataPaths } from '../storage/BuddyDataPaths'
import type {
  CapturedFileStateRecord,
  ChangeSetRecord,
  ChangeSetRepository,
  FileChangeCaptureRecord,
} from './changeSetRepository'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { redactSensitiveText } from '../../../shared/approvalReviewPayload'
import { resolveGrantedPath } from '../directories/resolveGrantedPath'

const MAX_CHANGE_TEXT_BYTES = 1024 * 1024
const MAX_CHANGE_HASH_BYTES = 32 * 1024 * 1024
const MAX_SHELL_SNAPSHOT_BYTES = 256 * 1024 * 1024
const MAX_SHELL_SNAPSHOT_FILES = 4096
const IGNORED_SHELL_DIRECTORIES = new Set([
  '.git',
  '.hg',
  '.pnpm',
  '.svn',
  '.venv',
  '.yarn',
  'node_modules',
  'target',
  'venv',
])

interface FileToolInput {
  conversationId: string
  cwd: string
  grants: readonly DirectoryGrant[]
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

export interface CapturedFileChange {
  canonicalPath: string
  changeType: 'created' | 'deleted' | 'updated'
}

export interface CapturedFileMove {
  changeType: 'renamed'
  fromPath: string
  toPath: string
}

export type CapturedWorkspaceChange = CapturedFileChange | CapturedFileMove

interface ShellSnapshotState {
  canonicalPath: string
  directoryGrantId: string
  hash: string
  relativePath: string
  sizeBytes: number
}

interface ShellSnapshot {
  complete: boolean
  files: Map<string, ShellSnapshotState>
}

interface PendingShellCapture {
  conversationId: string
  runId: string
  snapshot: ShellSnapshot
}

export class ChangeCaptureService {
  readonly #paths: BuddyDataPaths
  readonly #repository: ChangeSetRepository
  readonly #shellCaptures = new Map<string, PendingShellCapture>()

  constructor(options: { paths: BuddyDataPaths, repository: ChangeSetRepository }) {
    this.#paths = options.paths
    this.#repository = options.repository
  }

  async beginFileTool(input: FileToolInput & { arguments: unknown }): Promise<void> {
    const requestedPath = readToolPath(input.arguments)
    const absolutePath = isAbsolute(requestedPath)
      ? requestedPath
      : resolve(input.cwd, requestedPath)
    const resolution = await resolveGrantedPath(
      input.grants,
      absolutePath,
      input.toolName === 'write' ? 'create' : 'existing',
    )
    const grant = requireGrant(input.grants, resolution.grantId)
    const captureId = randomUUID()
    const relativePath = displayGrantedPath(input.cwd, grant, resolution.canonicalPath)
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
      canonicalPath: resolution.canonicalPath,
      changeSetId: input.runId,
      completedAt: null,
      createdAt: now,
      directoryGrantId: resolution.grantId,
      id: captureId,
      relativePath,
      status: 'pending',
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      toolReportedError: null,
    })
  }

  async finishFileTool(
    input: FileToolInput & { isError: boolean },
  ): Promise<CapturedFileChange | null> {
    const capture = this.#repository.findCaptureByToolCallId(input.toolCallId)
    if (!capture || capture.changeSetId !== input.runId)
      return null
    if (!capture.canonicalPath || !capture.directoryGrantId)
      throw new ChangeCaptureError('VALIDATION_FAILED')
    const resolution = await resolveGrantedPath(input.grants, capture.canonicalPath, 'create')
    if (resolution.grantId !== capture.directoryGrantId)
      throw new ChangeCaptureError('PATH_OUTSIDE_GRANTED_DIRECTORY')
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
    if (sameState(capture.before, after))
      return null
    if (capture.before.kind === 'missing' && isTrackableFileState(after)) {
      return {
        canonicalPath: resolution.canonicalPath,
        changeType: 'created',
      }
    }
    if (isTrackableFileState(capture.before) && after.kind === 'missing') {
      return {
        canonicalPath: resolution.canonicalPath,
        changeType: 'deleted',
      }
    }
    return isTrackableFileState(capture.before) && isTrackableFileState(after)
      ? {
          canonicalPath: resolution.canonicalPath,
          changeType: 'updated',
        }
      : null
  }

  async beginShellTool(input: {
    conversationId: string
    grants: readonly DirectoryGrant[]
    runId: string
    toolCallId: string
  }): Promise<void> {
    this.#shellCaptures.set(input.toolCallId, {
      conversationId: input.conversationId,
      runId: input.runId,
      snapshot: await captureShellSnapshot(input.grants),
    })
  }

  async finishShellTool(input: {
    conversationId: string
    grants: readonly DirectoryGrant[]
    runId: string
    toolCallId: string
  }): Promise<{ changes: CapturedWorkspaceChange[], complete: boolean }> {
    const before = this.#shellCaptures.get(input.toolCallId)
    this.#shellCaptures.delete(input.toolCallId)
    if (
      !before
      || before.conversationId !== input.conversationId
      || before.runId !== input.runId
    ) {
      throw new ChangeCaptureError('VALIDATION_FAILED')
    }
    const after = await captureShellSnapshot(input.grants)
    return {
      changes: diffShellSnapshots(before.snapshot.files, after.files),
      complete: before.snapshot.complete && after.complete,
    }
  }

  async markPartial(input: { conversationId: string, runId: string }): Promise<void> {
    const now = new Date().toISOString()
    this.#ensureSet(input.runId, input.conversationId, now)
    this.#repository.markPartial(input.runId, now)
  }

  async markInterrupted(runId: string): Promise<void> {
    this.#discardShellCaptures(runId)
    const changeSet = this.#repository.findSetById(runId)
    if (!changeSet)
      return
    const now = new Date().toISOString()
    this.#repository.markPartial(runId, now)
    const captures = this.#repository.listCaptures(runId)
    this.#repository.finalizeSet(runId, aggregateCaptures(captures).length, now)
  }

  async finalizeRun(runId: string): Promise<void> {
    this.#discardShellCaptures(runId)
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

  #discardShellCaptures(runId: string): void {
    for (const [toolCallId, capture] of this.#shellCaptures) {
      if (capture.runId === runId)
        this.#shellCaptures.delete(toolCallId)
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
    const key = `${capture.directoryGrantId ?? ''}\0${capture.canonicalPath ?? capture.relativePath}`
    const group = groups.get(key) ?? []
    group.push(capture)
    groups.set(key, group)
  }
  return [...groups].flatMap(([, group]) => {
    const first = group[0]
    const last = group.at(-1)
    if (!first || !last)
      return []
    const after = last.after ?? emptyState('unavailable')
    if (sameState(first.before, after))
      return []
    return [{ after, before: first.before, first, relativePath: first.relativePath }]
  })
}

function sameState(left: CapturedFileStateRecord, right: CapturedFileStateRecord): boolean {
  if (left.kind !== right.kind || left.sizeBytes !== right.sizeBytes)
    return false
  if (left.kind === 'missing')
    return true
  return left.hash !== null && left.hash === right.hash
}

function isTrackableFileState(state: CapturedFileStateRecord): boolean {
  return state.hash !== null
    && state.kind !== 'missing'
    && state.kind !== 'sensitive'
    && state.kind !== 'unavailable'
}

async function captureShellSnapshot(
  grants: readonly DirectoryGrant[],
): Promise<ShellSnapshot> {
  const files = new Map<string, ShellSnapshotState>()
  const seenPaths = new Set<string>()
  const budget = {
    bytes: 0,
    complete: true,
    files: 0,
  }
  const uniqueGrants = [...new Map(
    grants.map(grant => [grant.grantId, grant]),
  ).values()].sort((left, right) => right.canonicalRoot.length - left.canonicalRoot.length)

  for (const grant of uniqueGrants) {
    if (budget.files >= MAX_SHELL_SNAPSHOT_FILES)
      break
    try {
      const metadata = await stat(grant.canonicalRoot)
      if (!metadata.isDirectory()) {
        budget.complete = false
        continue
      }
      await scanGrantDirectory(grant, grant.canonicalRoot, files, seenPaths, budget)
    }
    catch {
      budget.complete = false
    }
  }
  return { complete: budget.complete, files }
}

async function scanGrantDirectory(
  grant: DirectoryGrant,
  directory: string,
  files: Map<string, ShellSnapshotState>,
  seenPaths: Set<string>,
  budget: { bytes: number, complete: boolean, files: number },
): Promise<void> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  }
  catch {
    budget.complete = false
    return
  }
  entries.sort((left, right) => left.name.localeCompare(right.name))
  for (const entry of entries) {
    if (budget.files >= MAX_SHELL_SNAPSHOT_FILES) {
      budget.complete = false
      return
    }
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      if (!IGNORED_SHELL_DIRECTORIES.has(entry.name))
        await scanGrantDirectory(grant, path, files, seenPaths, budget)
      continue
    }
    if (!entry.isFile() || seenPaths.has(path))
      continue
    const relativePath = relative(grant.canonicalRoot, path).split(sep).join('/')
    if (!relativePath || isSensitivePath(relativePath))
      continue
    try {
      const metadata = await stat(path)
      if (
        !metadata.isFile()
        || metadata.size > MAX_CHANGE_HASH_BYTES
        || budget.bytes + metadata.size > MAX_SHELL_SNAPSHOT_BYTES
      ) {
        budget.complete = false
        continue
      }
      const bytes = await readFile(path)
      const state: ShellSnapshotState = {
        canonicalPath: path,
        directoryGrantId: grant.grantId,
        hash: createHash('sha256').update(bytes).digest('hex'),
        relativePath,
        sizeBytes: bytes.byteLength,
      }
      files.set(shellSnapshotKey(state), state)
      seenPaths.add(path)
      budget.bytes += bytes.byteLength
      budget.files += 1
    }
    catch {
      budget.complete = false
    }
  }
}

function diffShellSnapshots(
  before: ReadonlyMap<string, ShellSnapshotState>,
  after: ReadonlyMap<string, ShellSnapshotState>,
): CapturedWorkspaceChange[] {
  const changes: CapturedWorkspaceChange[] = []
  const deleted: ShellSnapshotState[] = []
  const created: ShellSnapshotState[] = []

  for (const [key, previous] of before) {
    const current = after.get(key)
    if (!current) {
      deleted.push(previous)
      continue
    }
    if (current.hash !== previous.hash || current.sizeBytes !== previous.sizeBytes) {
      changes.push({
        canonicalPath: current.canonicalPath,
        changeType: 'updated',
      })
    }
  }
  for (const [key, current] of after) {
    if (!before.has(key))
      created.push(current)
  }

  const deletedByFingerprint = groupShellStatesByFingerprint(deleted)
  const createdByFingerprint = groupShellStatesByFingerprint(created)
  const movedFrom = new Set<string>()
  const movedTo = new Set<string>()
  for (const [fingerprint, previous] of deletedByFingerprint) {
    const current = createdByFingerprint.get(fingerprint)
    if (previous.length !== 1 || current?.length !== 1)
      continue
    const [from] = previous
    const [to] = current
    if (!from || !to)
      continue
    movedFrom.add(shellSnapshotKey(from))
    movedTo.add(shellSnapshotKey(to))
    changes.push({
      changeType: 'renamed',
      fromPath: from.canonicalPath,
      toPath: to.canonicalPath,
    })
  }
  changes.push(...deleted
    .filter(state => !movedFrom.has(shellSnapshotKey(state)))
    .map(state => ({
      canonicalPath: state.canonicalPath,
      changeType: 'deleted' as const,
    })))
  changes.push(...created
    .filter(state => !movedTo.has(shellSnapshotKey(state)))
    .map(state => ({
      canonicalPath: state.canonicalPath,
      changeType: 'created' as const,
    })))
  return changes.sort((left, right) => (
    workspaceChangePath(left).localeCompare(workspaceChangePath(right))
  ))
}

function groupShellStatesByFingerprint(
  states: readonly ShellSnapshotState[],
): Map<string, ShellSnapshotState[]> {
  const groups = new Map<string, ShellSnapshotState[]>()
  for (const state of states) {
    const key = `${state.hash}\0${state.sizeBytes}`
    const group = groups.get(key) ?? []
    group.push(state)
    groups.set(key, group)
  }
  return groups
}

function shellSnapshotKey(state: ShellSnapshotState): string {
  return `${state.directoryGrantId}\0${state.relativePath}`
}

function workspaceChangePath(change: CapturedWorkspaceChange): string {
  return change.changeType === 'renamed' ? change.toPath : change.canonicalPath
}

function emptyState(kind: 'missing' | 'unavailable'): CapturedFileStateRecord {
  return { hash: null, kind, redacted: false, sizeBytes: null, snapshotPath: null }
}

function displayGrantedPath(
  cwd: string,
  grant: DirectoryGrant,
  path: string,
): string {
  const result = relative(grant.canonicalRoot, path)
  if (!result || result === '..' || result.startsWith(`..${sep}`))
    throw new ChangeCaptureError('PATH_OUTSIDE_GRANTED_DIRECTORY')
  const normalized = result.split(sep).join('/')
  return grant.canonicalRoot === cwd ? normalized : `${basename(grant.root)}/${normalized}`
}

function requireGrant(grants: readonly DirectoryGrant[], grantId: string): DirectoryGrant {
  const grant = grants.find(candidate => candidate.grantId === grantId)
  if (!grant)
    throw new ChangeCaptureError('PATH_OUTSIDE_GRANTED_DIRECTORY')
  return grant
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
