import { realpath } from 'node:fs/promises'
import { BoundedFileReadError } from './boundedFileError'
import { containsCanonicalPath, filePaths } from './filePaths'
import { readNativeBoundedFile } from './nativeBoundedFile'

export { BoundedFileReadError } from './boundedFileError'

export async function readBoundedFile(root: string, path: string, maxBytes = 8 * 1024 * 1024, signal?: AbortSignal) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > 64 * 1024 * 1024)
    throw new BoundedFileReadError('BOUNDED_FILE_OUTPUT_LIMIT')
  try {
    signal?.throwIfAborted()
    const canonicalRoot = await realpath(filePaths.resolveInput(root))
    const canonicalPath = await realpath(filePaths.resolveInput(path))
    if (!containsCanonicalPath(canonicalRoot, canonicalPath))
      throw new BoundedFileReadError('BOUNDED_FILE_READ_FAILED')
    return await readNativeBoundedFile(canonicalRoot, canonicalPath, maxBytes, signal)
  }
  catch (error) {
    if (error instanceof BoundedFileReadError)
      throw error
    throw new BoundedFileReadError('BOUNDED_FILE_READ_FAILED', { cause: error })
  }
}
