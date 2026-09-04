import type {
  PathZone,
  PermissionGrant,
  PermissionPathMode,
} from './permissionContract'
import type { SensitivePathMatcher } from './sensitivePaths'
import { realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, resolve, sep } from 'node:path'

export type PathClassificationErrorCode = 'INVALID_PATH' | 'PATH_NOT_FOUND'

export interface PathClassification {
  canonicalPath: string
  grantId: string | null
  grantRoot: string
  isDirectory: boolean
  requestedPath: string
  zone: PathZone
}

export class PathClassificationError extends Error {
  readonly code: PathClassificationErrorCode

  constructor(code: PathClassificationErrorCode, options?: ErrorOptions) {
    super('Lexora Buddy cannot resolve the requested path', options)
    this.name = 'PathClassificationError'
    this.code = code
  }
}

export interface ClassifyPathOptions {
  cwd: string
  grants: readonly PermissionGrant[]
  mode: PermissionPathMode
  path: string
  sensitive: SensitivePathMatcher
}

export async function classifyPath(
  options: ClassifyPathOptions,
): Promise<PathClassification> {
  const requestedPath = options.path
  if (!requestedPath.trim())
    throw new PathClassificationError('INVALID_PATH')

  const absolutePath = isAbsolute(requestedPath)
    ? requestedPath
    : resolve(options.cwd, requestedPath)

  let canonicalPath: string
  let grantRoot: string
  let isDirectory = false
  try {
    if (options.mode === 'existing') {
      canonicalPath = await realpath(absolutePath)
      isDirectory = (await stat(canonicalPath)).isDirectory()
      grantRoot = isDirectory ? canonicalPath : dirname(canonicalPath)
    }
    else {
      const resolved = await resolveCreatePath(absolutePath)
      canonicalPath = resolved.canonicalPath
      isDirectory = resolved.isDirectory
      grantRoot = isDirectory ? canonicalPath : dirname(canonicalPath)
    }
  }
  catch (error) {
    if (error instanceof PathClassificationError)
      throw error
    if (isMissingPathError(error))
      throw new PathClassificationError('PATH_NOT_FOUND', { cause: error })
    throw new PathClassificationError('INVALID_PATH', { cause: error })
  }

  if (options.sensitive.matches(canonicalPath)) {
    return {
      canonicalPath,
      grantId: null,
      grantRoot,
      isDirectory,
      requestedPath: absolutePath,
      zone: 'sensitive',
    }
  }

  const grant = [...options.grants]
    .sort((left, right) => right.canonicalRoot.length - left.canonicalRoot.length)
    .find(candidate => containsPath(candidate.canonicalRoot, canonicalPath))

  return {
    canonicalPath,
    grantId: grant?.grantId ?? null,
    grantRoot,
    isDirectory,
    requestedPath: absolutePath,
    zone: grant ? grant.kind : 'outside',
  }
}

export function toGrantRoot(classification: PathClassification): string {
  return classification.grantRoot
}

async function resolveCreatePath(requestedPath: string): Promise<{
  canonicalPath: string
  isDirectory: boolean
}> {
  let cursor = resolve(requestedPath)
  const missingSegments: string[] = []

  while (true) {
    try {
      const canonicalParent = await realpath(cursor)
      const metadata = await stat(canonicalParent)
      if (!metadata.isDirectory() && missingSegments.length > 0)
        throw new PathClassificationError('INVALID_PATH')
      return {
        canonicalPath: resolve(canonicalParent, ...missingSegments),
        isDirectory: missingSegments.length === 0 && metadata.isDirectory(),
      }
    }
    catch (error) {
      if (!isMissingPathError(error))
        throw error
      const parent = dirname(cursor)
      if (parent === cursor)
        throw new PathClassificationError('PATH_NOT_FOUND', { cause: error })
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
