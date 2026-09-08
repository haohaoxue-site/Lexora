import type { DirectoryGrant } from '../directories/resolveGrantedPath'
import type { FileCaptureKind } from './changeSetRepository'
import { opendir, stat } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { relativeCanonicalPath } from '../../../platform/filePaths'
import { captureChangeFile } from './captureChangeFile'
import { displayGrantedPath, MAX_CHANGE_HASH_BYTES } from './changeFileContent'

const MAX_WORKSPACE_SNAPSHOT_BYTES = 256 * 1024 * 1024
const MAX_WORKSPACE_SNAPSHOT_FILES = 4096
const MAX_WORKSPACE_ENTRIES = 16384
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

export interface WorkspaceSnapshotState {
  canonicalPath: string
  directoryGrantId: string
  hash: string
  kind: Exclude<FileCaptureKind, 'missing' | 'unavailable'>
  redacted: boolean
  relativePath: string
  sizeBytes: number
  snapshotText: string | null
}

export interface WorkspaceSnapshot {
  complete: boolean
  files: Map<string, WorkspaceSnapshotState>
}

export async function captureWorkspaceSnapshot(
  grants: readonly DirectoryGrant[],
  cwd: string,
): Promise<WorkspaceSnapshot> {
  const files = new Map<string, WorkspaceSnapshotState>()
  const seenPaths = new Set<string>()
  const budget = {
    bytes: 0,
    complete: true,
    files: 0,
    entries: 0,
  }
  const uniqueGrants = [...new Map(
    grants.map(grant => [grant.grantId, grant]),
  ).values()].sort((left, right) => right.canonicalRoot.length - left.canonicalRoot.length)

  for (const grant of uniqueGrants) {
    if (budget.files >= MAX_WORKSPACE_SNAPSHOT_FILES || budget.entries >= MAX_WORKSPACE_ENTRIES) {
      budget.complete = false
      break
    }
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
  budget: { bytes: number, complete: boolean, files: number, entries: number },
): Promise<void> {
  const entries = []
  try {
    for await (const entry of await opendir(directory)) {
      if (entries.length >= MAX_WORKSPACE_ENTRIES - budget.entries) {
        budget.complete = false
        break
      }
      entries.push(entry)
    }
  }
  catch {
    budget.complete = false
    return
  }
  entries.sort((left, right) => left.name.localeCompare(right.name))
  for (const entry of entries) {
    if (budget.files >= MAX_WORKSPACE_SNAPSHOT_FILES || budget.entries >= MAX_WORKSPACE_ENTRIES) {
      budget.complete = false
      return
    }
    budget.entries += 1
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      if (!IGNORED_WORKSPACE_DIRECTORIES.has(entry.name))
        await scanGrantDirectory(grant, path, cwd, files, seenPaths, budget)
      continue
    }
    if (!entry.isFile() || seenPaths.has(path))
      continue
    const child = relativeCanonicalPath(grant.canonicalRoot, path)
    if (child === null) {
      budget.complete = false
      continue
    }
    if (!child)
      continue
    const relativePath = child.split(sep).join('/')
    try {
      const content = await captureChangeFile(path, relativePath, Math.min(MAX_CHANGE_HASH_BYTES, MAX_WORKSPACE_SNAPSHOT_BYTES - budget.bytes))
      if (content.hash === null) {
        budget.complete = false
        continue
      }
      const state: WorkspaceSnapshotState = {
        ...content,
        hash: content.hash,
        canonicalPath: path,
        directoryGrantId: grant.grantId,
        relativePath: displayGrantedPath(cwd, grant, path),
      }
      files.set(workspaceSnapshotKey(state), state)
      seenPaths.add(path)
      budget.bytes += content.sizeBytes
      budget.files += 1
    }
    catch {
      budget.complete = false
    }
  }
}

export function workspaceSnapshotKey(state: WorkspaceSnapshotState): string {
  return `${state.directoryGrantId}\0${state.relativePath}`
}
