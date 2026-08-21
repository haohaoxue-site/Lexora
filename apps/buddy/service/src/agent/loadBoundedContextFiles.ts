import { Buffer } from 'node:buffer'
import { readFile, realpath, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

import { GrantedPathError, resolveGrantedPath } from '../projects/resolveGrantedPath'

const MAX_CONTEXT_FILE_BYTES = 64 * 1024
const MAX_CONTEXT_TOTAL_BYTES = 256 * 1024
const MAX_CONTEXT_DIRECTORIES = 32

export interface BoundedContextDiagnostic {
  code: 'CONTEXT_DEPTH_EXCEEDED' | 'CONTEXT_FILE_TOO_LARGE' | 'CONTEXT_FILE_UNREADABLE'
  message: string
}

export interface BoundedContextFile {
  content: string
  path: string
}

export interface LoadBoundedContextFilesOptions {
  canonicalRoot: string
  cwd: string
}

export interface BoundedContextFilesResult {
  agentsFiles: BoundedContextFile[]
  diagnostics: BoundedContextDiagnostic[]
}

export async function loadBoundedContextFiles(
  options: LoadBoundedContextFilesOptions,
): Promise<BoundedContextFilesResult> {
  const [canonicalRoot, canonicalCwd] = await Promise.all([
    realpath(options.canonicalRoot),
    realpath(options.cwd),
  ])
  if (!containsPath(canonicalRoot, canonicalCwd))
    throw new GrantedPathError('PATH_OUTSIDE_GRANTED_DIRECTORY')

  const directories = directoriesFromRoot(canonicalRoot, canonicalCwd)
  if (directories.length > MAX_CONTEXT_DIRECTORIES) {
    return {
      agentsFiles: [],
      diagnostics: [{
        code: 'CONTEXT_DEPTH_EXCEEDED',
        message: 'Lexora Buddy directory context is too deeply nested',
      }],
    }
  }

  const agentsFiles: BoundedContextFile[] = []
  const diagnostics: BoundedContextDiagnostic[] = []
  let totalBytes = 0

  for (const directory of directories) {
    const path = join(directory, 'AGENTS.md')
    try {
      const resolution = await resolveGrantedPath([{
        canonicalRoot,
        projectId: 'context',
        root: canonicalRoot,
      }], path, 'existing')
      const metadata = await stat(resolution.canonicalPath)
      if (!metadata.isFile())
        continue
      if (metadata.size > MAX_CONTEXT_FILE_BYTES || totalBytes + metadata.size > MAX_CONTEXT_TOTAL_BYTES) {
        diagnostics.push({
          code: 'CONTEXT_FILE_TOO_LARGE',
          message: 'A Lexora Buddy directory context file exceeds the allowed size',
        })
        continue
      }

      const content = await readFile(resolution.canonicalPath, 'utf8')
      totalBytes += Buffer.byteLength(content)
      agentsFiles.push({ content, path: resolution.canonicalPath })
    }
    catch (error) {
      if (isMissingPathError(error))
        continue
      if (error instanceof GrantedPathError && error.code === 'PATH_NOT_FOUND')
        continue
      diagnostics.push({
        code: 'CONTEXT_FILE_UNREADABLE',
        message: 'Lexora Buddy could not read a directory context file',
      })
    }
  }

  return { agentsFiles, diagnostics }
}

function directoriesFromRoot(root: string, cwd: string): string[] {
  const child = relative(root, cwd)
  if (!child)
    return [root]

  const directories = [root]
  let cursor = root
  for (const segment of child.split(sep)) {
    cursor = join(cursor, segment)
    directories.push(cursor)
  }
  return directories
}

function containsPath(root: string, path: string): boolean {
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`
  return path === root || path.startsWith(prefix)
}

function isMissingPathError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}
