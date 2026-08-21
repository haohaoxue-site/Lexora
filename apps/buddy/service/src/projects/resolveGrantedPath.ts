import { realpath } from 'node:fs/promises'
import {
  basename,
  dirname,
  isAbsolute,
  resolve,
  sep,
} from 'node:path'

export interface ProjectGrant {
  canonicalRoot: string
  projectId: string
  root: string
}

export interface GrantedPathResolution {
  canonicalPath: string
  projectId: string
  root: string
}

export type GrantedPathMode = 'existing' | 'create'

export class GrantedPathError extends Error {
  readonly code: 'INVALID_PATH' | 'PATH_NOT_FOUND' | 'PATH_OUTSIDE_GRANTED_DIRECTORY'

  constructor(code: GrantedPathError['code'], options?: ErrorOptions) {
    super('Lexora Buddy cannot access the requested path', options)
    this.name = 'GrantedPathError'
    this.code = code
  }
}

export async function resolveGrantedPath(
  grants: readonly ProjectGrant[],
  requestedPath: string,
  mode: GrantedPathMode,
): Promise<GrantedPathResolution> {
  if (!requestedPath.trim() || !isAbsolute(requestedPath))
    throw new GrantedPathError('INVALID_PATH')

  let canonicalPath: string
  try {
    canonicalPath = mode === 'existing'
      ? await realpath(requestedPath)
      : await resolveCreatePath(requestedPath)
  }
  catch (error) {
    if (error instanceof GrantedPathError)
      throw error
    if (isMissingPathError(error))
      throw new GrantedPathError('PATH_NOT_FOUND', { cause: error })
    throw new GrantedPathError('INVALID_PATH', { cause: error })
  }

  const grant = [...grants]
    .sort((left, right) => right.canonicalRoot.length - left.canonicalRoot.length)
    .find(grant => containsPath(grant.canonicalRoot, canonicalPath))
  if (!grant)
    throw new GrantedPathError('PATH_OUTSIDE_GRANTED_DIRECTORY')

  return {
    canonicalPath,
    projectId: grant.projectId,
    root: grant.root,
  }
}

async function resolveCreatePath(requestedPath: string): Promise<string> {
  let cursor = resolve(requestedPath)
  const missingSegments: string[] = []

  while (true) {
    try {
      const canonicalParent = await realpath(cursor)
      return resolve(canonicalParent, ...missingSegments)
    }
    catch (error) {
      if (!isMissingPathError(error))
        throw error
      const parent = dirname(cursor)
      if (parent === cursor)
        throw new GrantedPathError('PATH_NOT_FOUND', { cause: error })
      missingSegments.unshift(basename(cursor))
      cursor = parent
    }
  }
}

function containsPath(root: string, path: string): boolean {
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`
  return path === root || path.startsWith(prefix)
}

function isMissingPathError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}
