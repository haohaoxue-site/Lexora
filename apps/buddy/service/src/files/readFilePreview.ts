import type { FilePreview } from '../../../shared/files/filePreview'
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { readBoundedFile } from '../../../platform/filesystem/boundedFile'
import { decodeText } from '../changes/changeFileContent'
import { BuddyServiceError } from '../rpc/runtimeRequest'

const IMAGE_MIME_TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
}

export async function readFilePreview(root: string, path: string): Promise<FilePreview> {
  const metadata = await stat(path)
  if (!metadata.isFile())
    throw new BuddyServiceError('VALIDATION_FAILED')
  const mimeType = IMAGE_MIME_TYPES[extname(path).toLowerCase()]
  const maximum = mimeType ? 8 * 1024 * 1024 : 1024 * 1024
  if (metadata.size > maximum)
    return { kind: 'oversized', sizeBytes: metadata.size, text: null, imageUrl: null }
  const bytes = await readBoundedFile(root, path, maximum)
  if (mimeType)
    return { kind: 'image', sizeBytes: bytes.length, text: null, imageUrl: `data:${mimeType};base64,${bytes.toString('base64')}` }
  const text = decodeText(bytes)
  return { kind: text === null ? 'binary' : 'text', sizeBytes: bytes.length, text, imageUrl: null }
}
