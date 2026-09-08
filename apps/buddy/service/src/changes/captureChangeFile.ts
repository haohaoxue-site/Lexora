import type { FileCaptureKind } from './changeSetRepository'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { redactSensitiveText } from '../../../shared/permissions/approvalReviewPayload'
import { decodeText, isSensitivePath, MAX_CHANGE_HASH_BYTES, MAX_CHANGE_TEXT_BYTES } from './changeFileContent'

interface ChangeFileContent {
  hash: string | null
  kind: Exclude<FileCaptureKind, 'missing' | 'unavailable'>
  redacted: boolean
  sizeBytes: number
  snapshotText: string | null
}

export async function captureChangeFile(path: string, displayPath: string, maxBytes = MAX_CHANGE_HASH_BYTES): Promise<ChangeFileContent> {
  const before = await lstat(path)
  if (!before.isFile() || await realpath(path) !== path)
    throw new Error('Change capture requires a canonical regular file')
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
  try {
    const metadata = await handle.stat()
    if (!metadata.isFile() || metadata.dev !== before.dev || metadata.ino !== before.ino)
      throw new Error('Change capture target changed')
    if (metadata.size > maxBytes)
      return { hash: null, kind: 'oversized', redacted: false, sizeBytes: metadata.size, snapshotText: null }
    const hash = createHash('sha256')
    const chunks: Buffer[] = []
    const sensitive = isSensitivePath(displayPath)
    let sizeBytes = 0
    const buffer = Buffer.allocUnsafe(64 * 1024)
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, maxBytes - sizeBytes + 1), null)
      if (bytesRead === 0)
        break
      sizeBytes += bytesRead
      if (sizeBytes > maxBytes)
        throw new Error('Change capture byte limit exceeded')
      const bytes = buffer.subarray(0, bytesRead)
      hash.update(bytes)
      if (!sensitive && sizeBytes <= MAX_CHANGE_TEXT_BYTES)
        chunks.push(Buffer.from(bytes))
      else
        chunks.length = 0
    }
    const after = await handle.stat()
    const current = await lstat(path)
    if (after.size !== sizeBytes || metadata.size !== after.size || metadata.mtimeMs !== after.mtimeMs || metadata.ctimeMs !== after.ctimeMs
      || current.dev !== after.dev || current.ino !== after.ino || await realpath(path) !== path) {
      throw new Error('Change capture target changed while reading')
    }
    const text = sensitive || sizeBytes > MAX_CHANGE_TEXT_BYTES ? null : decodeText(Buffer.concat(chunks, sizeBytes))
    const snapshotText = text === null ? null : redactSensitiveText(text)
    return {
      hash: hash.digest('hex'),
      kind: sensitive ? 'sensitive' : sizeBytes > MAX_CHANGE_TEXT_BYTES ? 'oversized' : text === null ? 'binary' : 'text',
      redacted: snapshotText !== null && snapshotText !== text,
      sizeBytes,
      snapshotText,
    }
  }
  finally {
    await handle.close()
  }
}
