import type {
  PathZone,
  PermissionGrant,
  PermissionPathMode,
} from './permissionContract'
import type { SensitivePathMatcher } from './sensitivePaths'
import { dirname } from 'node:path'
import { containsCanonicalPath } from '../../../platform/filesystem/filePaths'
import { FilePathResolutionError, resolveFilePath } from '../../../platform/filesystem/resolveFilePath'

export type PathClassificationErrorCode = 'INVALID_PATH' | 'PATH_NOT_FOUND'

export interface PathClassification {
  canonicalPath: string
  grantId: string | null
  grantRoot: string
  isDirectory: boolean
  isFile: boolean
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
  let resolution
  try {
    resolution = await resolveFilePath(options.path, options.mode, options.cwd)
  }
  catch (error) {
    throw new PathClassificationError(error instanceof FilePathResolutionError ? error.code : 'INVALID_PATH', { cause: error })
  }
  const { canonicalPath, isDirectory, isFile, requestedPath } = resolution
  const grantRoot = isDirectory ? canonicalPath : dirname(canonicalPath)

  if (options.sensitive.matches(requestedPath) || options.sensitive.matches(canonicalPath)) {
    return {
      canonicalPath,
      grantId: null,
      grantRoot,
      isDirectory,
      isFile,
      requestedPath,
      zone: 'sensitive',
    }
  }

  const grant = [...options.grants]
    .sort((left, right) => right.canonicalRoot.length - left.canonicalRoot.length)
    .find(candidate => containsCanonicalPath(candidate.canonicalRoot, canonicalPath))

  return {
    canonicalPath,
    grantId: grant?.grantId ?? null,
    grantRoot,
    isDirectory,
    isFile,
    requestedPath,
    zone: grant ? grant.kind : 'outside',
  }
}

export function toGrantRoot(classification: PathClassification): string {
  return classification.grantRoot
}
