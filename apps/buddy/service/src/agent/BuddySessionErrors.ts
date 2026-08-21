import { resolve } from 'node:path'

export class BuddySessionCreationError extends Error {
  readonly code = 'SESSION_BINDING_INVALID'

  constructor(options?: ErrorOptions) {
    super('Lexora Buddy session binding is invalid', options)
    this.name = 'BuddySessionCreationError'
  }
}

export class BuddySessionStorageError extends Error {
  readonly code = 'SESSION_STORAGE_UNAVAILABLE'

  constructor(options?: ErrorOptions) {
    super('Lexora Buddy session storage is unavailable', options)
    this.name = 'BuddySessionStorageError'
  }
}

export function isMissingBuddySessionFile(error: unknown): boolean {
  return isNodeFileSystemError(error) && error.code === 'ENOENT'
}

export function toBuddySessionStorageError(
  error: unknown,
  expectedPath?: string,
): BuddySessionStorageError | null {
  if (error instanceof BuddySessionStorageError)
    return error
  if (!isNodeFileSystemError(error))
    return null
  if (expectedPath !== undefined && !matchesFileSystemErrorPath(error, expectedPath))
    return null
  return new BuddySessionStorageError({ cause: error })
}

function isNodeFileSystemError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error
    && typeof (error as NodeJS.ErrnoException).code === 'string'
    && typeof (error as NodeJS.ErrnoException).syscall === 'string'
}

function matchesFileSystemErrorPath(error: NodeJS.ErrnoException, expectedPath: string): boolean {
  return typeof error.path === 'string'
    && resolve(error.path) === resolve(expectedPath)
}
