import type { DirectoryGrant } from '../directories/resolveGrantedPath'
import type { BuddyDataPaths } from '../storage/BuddyDataPaths'
import type {
  CapturedFileStateRecord,
  ChangeSetRecord,
  ChangeSetRepository,
  FileCaptureKind,
  FileChangeCaptureRecord,
} from './changeSetRepository'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { redactSensitiveText } from '../../../shared/approvalReviewPayload'
import { resolveGrantedPath } from '../directories/resolveGrantedPath'

const MAX_CHANGE_TEXT_BYTES = 1024 * 1024
const MAX_CHANGE_HASH_BYTES = 32 * 1024 * 1024
const MAX_WORKSPACE_SNAPSHOT_BYTES = 256 * 1024 * 1024
const MAX_WORKSPACE_SNAPSHOT_FILES = 4096
const IGNORED_WORKSPACE_DIRECTORIES = new Set([
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

interface WorkspaceSnapshotState {
  canonicalPath: string
  directoryGrantId: string
  hash: string
  kind: Exclude<FileCaptureKind, 'missing' | 'unavailable'>
  redacted: boolean
  relativePath: string
  sizeBytes: number
  snapshotText: string | null
}

interface WorkspaceSnapshot {
  complete: boolean
  files: Map<string, WorkspaceSnapshotState>
}

interface PendingWorkspaceCapture {
  conversationId: string
  runId: string
  snapshot: WorkspaceSnapshot
}

export class ChangeCaptureService {
  readonly #paths: BuddyDataPaths
  readonly #repository: ChangeSetRepository
  readonly #workspaceCaptures = new Map<string, PendingWorkspaceCapture>()

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
  ): Promise<void> {
    const capture = this.#repository.findCaptureByToolCallId(input.toolCallId)
    if (!capture || capture.changeSetId !== input.runId)
      return
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
  }

  async beginWorkspaceTool(input: {
    conversationId: string
    cwd: string
    grants: readonly DirectoryGrant[]
    runId: string
    toolCallId: string
  }): Promise<void> {
    this.#workspaceCaptures.set(input.toolCallId, {
      conversationId: input.conversationId,
      runId: input.runId,
      snapshot: await captureWorkspaceSnapshot(input.grants, input.cwd),
    })
  }

  async finishWorkspaceTool(input: {
    conversationId: string
    cwd: string
    grants: readonly DirectoryGrant[]
    isError: boolean
    runId: string
    toolCallId: string
    toolName: string
  }): Promise<{ complete: boolean }> {
    const before = this.#workspaceCaptures.get(input.toolCallId)
    this.#workspaceCaptures.delete(input.toolCallId)
    if (
      !before
      || before.conversationId !== input.conversationId
      || before.runId !== input.runId
    ) {
      throw new ChangeCaptureError('VALIDATION_FAILED')
    }
    const after = await captureWorkspaceSnapshot(input.grants, input.cwd)
    await this.#persistWorkspaceChanges({
      after: after.files,
      before: before.snapshot.files,
      conversationId: input.conversationId,
      isError: input.isError,
      runId: input.runId,
      toolCallId: input.toolCallId,
      toolName: input.toolName,
    })
    return { complete: before.snapshot.complete && after.complete }
  }

  async markPartial(input: { conversationId: string, runId: string }): Promise<void> {
    const now = new Date().toISOString()
    this.#ensureSet(input.runId, input.conversationId, now)
    this.#repository.markPartial(input.runId, now)
  }

  async markInterrupted(runId: string): Promise<void> {
    this.#discardWorkspaceCaptures(runId)
    const changeSet = this.#repository.findSetById(runId)
    if (!changeSet)
      return
    const now = new Date().toISOString()
    this.#repository.markPartial(runId, now)
    const captures = this.#repository.listCaptures(runId)
    this.#repository.finalizeSet(runId, aggregateCaptures(captures).length, now)
  }

  async finalizeRun(runId: string): Promise<void> {
    this.#discardWorkspaceCaptures(runId)
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

  async #persistWorkspaceChanges(input: {
    after: ReadonlyMap<string, WorkspaceSnapshotState>
    before: ReadonlyMap<string, WorkspaceSnapshotState>
    conversationId: string
    isError: boolean
    runId: string
    toolCallId: string
    toolName: string
  }): Promise<void> {
    const changedKeys = [...new Set([...input.before.keys(), ...input.after.keys()])]
      .filter(key => !sameWorkspaceState(input.before.get(key), input.after.get(key)))
      .sort()
    if (changedKeys.length === 0)
      return
    const now = new Date().toISOString()
    this.#ensureSet(input.runId, input.conversationId, now)
    for (const key of changedKeys) {
      const before = input.before.get(key)
      const after = input.after.get(key)
      const state = after ?? before
      if (!state)
        continue
      const captureId = randomUUID()
      this.#repository.createCapture({
        after: await this.#materializeWorkspaceState({
          captureId,
          conversationId: input.conversationId,
          runId: input.runId,
          side: 'after',
          state: after,
        }),
        before: await this.#materializeWorkspaceState({
          captureId,
          conversationId: input.conversationId,
          runId: input.runId,
          side: 'before',
          state: before,
        }),
        canonicalPath: state.canonicalPath,
        changeSetId: input.runId,
        completedAt: now,
        createdAt: now,
        directoryGrantId: state.directoryGrantId,
        id: captureId,
        relativePath: state.relativePath,
        status: 'completed',
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        toolReportedError: input.isError,
      })
    }
    this.#refreshFileCount(input.runId, now)
  }

  async #materializeWorkspaceState(input: {
    captureId: string
    conversationId: string
    runId: string
    side: 'after' | 'before'
    state: WorkspaceSnapshotState | undefined
  }): Promise<CapturedFileStateRecord> {
    if (!input.state)
      return emptyState('missing')
    if (input.state.kind !== 'text' || input.state.snapshotText === null) {
      return {
        hash: input.state.hash,
        kind: input.state.kind,
        redacted: input.state.redacted,
        sizeBytes: input.state.sizeBytes,
        snapshotPath: null,
      }
    }
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
    await writeFile(snapshotPath, input.state.snapshotText, { flag: 'wx', mode: 0o600 })
    return {
      hash: input.state.hash,
      kind: input.state.kind,
      redacted: input.state.redacted,
      sizeBytes: input.state.sizeBytes,
      snapshotPath,
    }
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

  #discardWorkspaceCaptures(runId: string): void {
    for (const [toolCallId, capture] of this.#workspaceCaptures) {
      if (capture.runId === runId)
        this.#workspaceCaptures.delete(toolCallId)
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

async function captureWorkspaceSnapshot(
  grants: readonly DirectoryGrant[],
  cwd: string,
): Promise<WorkspaceSnapshot> {
  const files = new Map<string, WorkspaceSnapshotState>()
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
    if (budget.files >= MAX_WORKSPACE_SNAPSHOT_FILES)
      break
    try {
      const metadata = await stat(grant.canonicalRoot)
      if (!metadata.isDirectory()) {
        budget.complete = false
        continue
      }
      await scanGrantDirectory(grant, grant.canonicalRoot, cwd, files, seenPaths, budget)
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
  cwd: string,
  files: Map<string, WorkspaceSnapshotState>,
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
    if (budget.files >= MAX_WORKSPACE_SNAPSHOT_FILES) {
      budget.complete = false
      return
    }
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      if (!IGNORED_WORKSPACE_DIRECTORIES.has(entry.name))
        await scanGrantDirectory(grant, path, cwd, files, seenPaths, budget)
      continue
    }
    if (!entry.isFile() || seenPaths.has(path))
      continue
    const relativePath = relative(grant.canonicalRoot, path).split(sep).join('/')
    if (!relativePath)
      continue
    try {
      const metadata = await stat(path)
      if (
        !metadata.isFile()
        || metadata.size > MAX_CHANGE_HASH_BYTES
        || budget.bytes + metadata.size > MAX_WORKSPACE_SNAPSHOT_BYTES
      ) {
        budget.complete = false
        continue
      }
      const bytes = await readFile(path)
      const text = metadata.size <= MAX_CHANGE_TEXT_BYTES ? decodeText(bytes) : null
      const redactedText = text === null ? null : redactSensitiveText(text)
      const state: WorkspaceSnapshotState = {
        canonicalPath: path,
        directoryGrantId: grant.grantId,
        hash: createHash('sha256').update(bytes).digest('hex'),
        kind: isSensitivePath(relativePath)
          ? 'sensitive'
          : metadata.size > MAX_CHANGE_TEXT_BYTES
            ? 'oversized'
            : text === null
              ? 'binary'
              : 'text',
        redacted: redactedText !== null && redactedText !== text,
        relativePath: displayGrantedPath(cwd, grant, path),
        sizeBytes: bytes.byteLength,
        snapshotText: isSensitivePath(relativePath) ? null : redactedText,
      }
      files.set(workspaceSnapshotKey(state), state)
      seenPaths.add(path)
      budget.bytes += bytes.byteLength
      budget.files += 1
    }
    catch {
      budget.complete = false
    }
  }
}

function workspaceSnapshotKey(state: WorkspaceSnapshotState): string {
  return `${state.directoryGrantId}\0${state.relativePath}`
}

function sameWorkspaceState(
  left: WorkspaceSnapshotState | undefined,
  right: WorkspaceSnapshotState | undefined,
): boolean {
  if (!left || !right)
    return left === right
  return left.hash === right.hash && left.sizeBytes === right.sizeBytes
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
  return path.split('/').some((segment) => {
    const name = segment.toLowerCase()
    const extension = extname(name)
    return name === '.env'
      || name.startsWith('.env.')
      || ['.credential', '.key', '.p12', '.pem'].includes(extension)
      || ['id_dsa', 'id_ecdsa', 'id_ed25519', 'id_rsa'].includes(name)
  })
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
