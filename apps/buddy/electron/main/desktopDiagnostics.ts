import { Buffer } from 'node:buffer'
import { appendFile, chmod, mkdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Writable } from 'node:stream'

export type DesktopDiagnosticScope = 'desktop' | 'local-service' | 'native-pet'

export interface DesktopDiagnosticLoggerOptions {
  directory: string
  maxBytes?: number
  userHome: string
}

export class DesktopDiagnosticLogger {
  readonly #directory: string
  readonly #maxBytes: number
  readonly #userHome: string
  #queue: Promise<void> = Promise.resolve()

  constructor(options: DesktopDiagnosticLoggerOptions) {
    this.#directory = options.directory
    this.#maxBytes = options.maxBytes ?? 2 * 1024 * 1024
    this.#userHome = options.userHome
  }

  write(scope: DesktopDiagnosticScope, message: string): Promise<void> {
    const line = `[${new Date().toISOString()}] ${redactDiagnosticText(message, this.#userHome)}\n`
    const operation = this.#queue.then(async () => {
      await mkdir(this.#directory, { mode: 0o700, recursive: true })
      const path = join(this.#directory, `${scope}.log`)
      await rotateIfNeeded(path, Buffer.byteLength(line), this.#maxBytes)
      await appendFile(path, line, { encoding: 'utf8', mode: 0o600 })
      await chmod(path, 0o600)
    })
    this.#queue = operation.catch(() => {})
    return operation
  }

  createWritable(scope: DesktopDiagnosticScope, mirror?: NodeJS.WritableStream): Writable {
    return new Writable({
      write: (chunk, _encoding, callback) => {
        mirror?.write(chunk)
        void this.write(scope, String(chunk).trimEnd()).then(
          () => callback(),
          error => callback(error),
        )
      },
    })
  }

  close(): Promise<void> {
    return this.#queue
  }
}

export function redactDiagnosticText(value: string, userHome: string): string {
  return value
    .replaceAll(userHome, '<home>')
    .replace(/(Authorization:\s*Bearer\s+)\S+/gi, '$1<redacted>')
    .replace(/\b(?:sk|key)-[\w-]+/gi, '<redacted>')
    .slice(0, 16 * 1024)
}

async function rotateIfNeeded(path: string, addedBytes: number, maxBytes: number): Promise<void> {
  const currentBytes = await stat(path).then(value => value.size, () => 0)
  if (currentBytes + addedBytes <= maxBytes)
    return
  await rm(`${path}.3`, { force: true })
  await renameIfPresent(`${path}.2`, `${path}.3`)
  await renameIfPresent(`${path}.1`, `${path}.2`)
  await renameIfPresent(path, `${path}.1`)
}

async function renameIfPresent(source: string, destination: string): Promise<void> {
  try {
    await rename(source, destination)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw error
  }
}
