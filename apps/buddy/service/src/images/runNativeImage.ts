import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { isAbsolute } from 'node:path'
import process from 'node:process'
import { IMAGE_TRANSFORM_ERROR_CODES, ImageTransformError } from './ImageTransformError'

const MAX_IMAGE_BYTES = 32 * 1024 * 1024

export interface ChromaOptions {
  color: string
  despill: number
  softness: number
  tolerance: number
}

type NativeImageRequest
  = | { operation: 'chroma', options: ChromaOptions }
    | { operation: 'validate', options: { mimeType: string } }

export async function runNativeImage(bytes: Uint8Array, request: NativeImageRequest, signal?: AbortSignal): Promise<Buffer> {
  signal?.throwIfAborted()
  const executable = process.env.LEXORA_BUDDY_IMAGE_TRANSFORMER
  if (!executable || !isAbsolute(executable))
    throw new ImageTransformError('IMAGE_TRANSFORM_UNAVAILABLE')
  if (bytes.byteLength > MAX_IMAGE_BYTES)
    throw new ImageTransformError('IMAGE_TRANSFORM_INPUT_TOO_LARGE')
  const metadata = Buffer.from(JSON.stringify(request))
  if (metadata.length > 1024)
    throw new ImageTransformError('VALIDATION_FAILED')
  const prefix = Buffer.alloc(4)
  prefix.writeUInt32BE(metadata.length)
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [], {
      env: process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {},
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const chunks: Buffer[] = []
    const errors: Buffer[] = []
    let size = 0
    let errorSize = 0
    let failure: ImageTransformError | undefined
    const stop = () => child.kill('SIGKILL')
    const timeout = setTimeout(() => {
      failure ??= new ImageTransformError('IMAGE_TRANSFORM_TIMEOUT')
      stop()
    }, 30_000)
    timeout.unref()
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > (request.operation === 'validate' ? 1024 : MAX_IMAGE_BYTES)) {
        failure ??= new ImageTransformError('IMAGE_TRANSFORM_OUTPUT_TOO_LARGE')
        stop()
      }
      else {
        chunks.push(chunk)
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      errorSize += chunk.length
      if (errorSize > 4096) {
        failure ??= new ImageTransformError('IMAGE_TRANSFORM_FAILED')
        stop()
      }
      else {
        errors.push(chunk)
      }
    })
    child.once('error', (error: NodeJS.ErrnoException) => {
      failure ??= new ImageTransformError(error.code === 'ENOENT' ? 'IMAGE_TRANSFORM_UNAVAILABLE' : 'IMAGE_TRANSFORM_FAILED', { cause: error })
    })
    child.once('close', (code) => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', stop)
      if (signal?.aborted)
        return reject(signal.reason)
      if (failure)
        return reject(failure)
      if (code !== 0 || errorSize > 0 || size === 0) {
        const detail = Buffer.concat(errors).toString('utf8').trim()
        return reject(new ImageTransformError(IMAGE_TRANSFORM_ERROR_CODES.find(code => code === detail) ?? 'IMAGE_TRANSFORM_FAILED'))
      }
      resolve(Buffer.concat(chunks, size))
    })
    child.stdin.on('error', () => {})
    signal?.addEventListener('abort', stop, { once: true })
    if (signal?.aborted) {
      stop()
      return
    }
    child.stdin.write(prefix)
    child.stdin.write(metadata)
    child.stdin.end(bytes)
  })
}
