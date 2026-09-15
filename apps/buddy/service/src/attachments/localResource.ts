import type { BuddyLocalResource } from '../../../shared/conversation/localResource'
import { realpath, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { buddyLocalResourceSchema, localResourcePathSchema } from '../../../shared/conversation/localResource'
import { createSensitivePathMatcher } from '../permissions/sensitivePaths'
import { BuddyServiceError } from '../rpc/runtimeRequest'
import { AttachmentError, inferMimeType } from './AttachmentService'

const sensitivePaths = createSensitivePathMatcher()

export async function inspectLocalResource(path: string): Promise<BuddyLocalResource> {
  localResourcePathSchema.parse(path)
  if (sensitivePaths.matches(path))
    throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
  let canonicalPath: string
  try {
    canonicalPath = await realpath(path)
  }
  catch (cause) {
    throw new AttachmentError('ATTACHMENT_NOT_FOUND', { cause })
  }
  if (sensitivePaths.matches(canonicalPath))
    throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
  const info = await stat(canonicalPath)
  if (!info.isFile() && !info.isDirectory())
    throw new AttachmentError('VALIDATION_FAILED')
  return buddyLocalResourceSchema.parse({
    kind: info.isDirectory() ? 'directory' : 'file',
    mimeType: info.isDirectory() ? 'inode/directory' : extname(canonicalPath).toLowerCase() === '.avif' ? 'image/avif' : inferMimeType(canonicalPath),
    name: basename(canonicalPath) || canonicalPath,
    path: canonicalPath,
    sizeBytes: info.isDirectory() ? 0 : info.size,
  })
}
