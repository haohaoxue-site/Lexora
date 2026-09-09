import type { FileHandle } from 'node:fs/promises'
import { chmod, mkdir, open, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'

export class DiagnosticFile {
  readonly #directory: string
  readonly #maxBytes: number
  readonly #maxFiles: number
  #handle: FileHandle | null = null
  #bytes = 0

  constructor(directory: string, maxBytes: number, maxFiles: number) {
    this.#directory = directory
    this.#maxBytes = maxBytes
    this.#maxFiles = maxFiles
  }

  async append(batch: Uint8Array): Promise<void> {
    if (!this.#handle || this.#bytes + batch.byteLength > this.#maxBytes) {
      await this.close()
      await mkdir(this.#directory, { recursive: true, mode: 0o700 })
      await chmod(this.#directory, 0o700)
      await this.#rotate()
      this.#handle = await open(this.#path(0), 'wx', 0o600)
      this.#bytes = 0
    }
    await this.#handle.appendFile(batch)
    this.#bytes += batch.byteLength
  }

  async close(): Promise<void> {
    const handle = this.#handle
    this.#handle = null
    await handle?.close()
  }

  #path(index: number): string {
    return join(this.#directory, index === 0 ? 'application.jsonl' : `application.${index}.jsonl`)
  }

  async #rotate(): Promise<void> {
    await rm(this.#path(this.#maxFiles - 1), { force: true })
    for (let index = this.#maxFiles - 2; index >= 0; index--) {
      try {
        await rename(this.#path(index), this.#path(index + 1))
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          throw error
      }
    }
  }
}
