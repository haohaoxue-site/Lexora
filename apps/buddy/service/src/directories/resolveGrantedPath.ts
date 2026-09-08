import { containsCanonicalPath } from '../../../platform/filesystem/filePaths'
import { FilePathResolutionError, resolveFilePath } from '../../../platform/filesystem/resolveFilePath'

export interface DirectoryGrant {
  canonicalRoot: string
  grantId: string
  kind: 'granted' | 'workspace'
  root: string
}

export interface GrantedPathResolution {
  canonicalPath: string
  grantId: string
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
  grants: readonly DirectoryGrant[],
  requestedPath: string,
  mode: GrantedPathMode,
): Promise<GrantedPathResolution> {
  let canonicalPath: string
  try {
    canonicalPath = (await resolveFilePath(requestedPath, mode)).canonicalPath
  }
  catch (error) {
    throw new GrantedPathError(error instanceof FilePathResolutionError ? error.code : 'INVALID_PATH', { cause: error })
  }

  const grant = [...grants]
    .sort((left, right) => right.canonicalRoot.length - left.canonicalRoot.length)
    .find(grant => containsCanonicalPath(grant.canonicalRoot, canonicalPath))
  if (!grant)
    throw new GrantedPathError('PATH_OUTSIDE_GRANTED_DIRECTORY')

  return {
    canonicalPath,
    grantId: grant.grantId,
    root: grant.root,
  }
}
