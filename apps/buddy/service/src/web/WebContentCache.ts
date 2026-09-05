import type { BuddyDataPaths } from '../storage/BuddyDataPaths'
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export class WebContentCache {
  readonly #paths: BuddyDataPaths
  readonly #pending = new Map<string, Promise<unknown>>()

  constructor(paths: BuddyDataPaths) { this.#paths = paths }

  write(conversationId: string, content: string): Promise<string> {
    const previous = this.#pending.get(conversationId) ?? Promise.resolve()
    const result = previous.catch(() => {}).then(async () => {
      const directory = join(this.#paths.conversationDirectory(conversationId), 'web-cache')
      await mkdir(directory, { recursive: true, mode: 0o700 })
      const path = join(directory, `${randomUUID()}.txt`)
      await writeFile(path, content, { mode: 0o600, flag: 'wx' })
      const entries = await readdir(directory, { withFileTypes: true })
      const files = await Promise.all(entries.filter(entry => entry.isFile() && /^[\da-f-]{36}\.txt$/.test(entry.name)).map(async (entry) => {
        const filePath = join(directory, entry.name)
        return { path: filePath, mtime: (await stat(filePath)).mtimeMs }
      }))
      const expired = files.filter(file => file.path !== path).sort((a, b) => b.mtime - a.mtime).slice(31)
      await Promise.all(expired.map(file => unlink(file.path)))
      return path
    })
    this.#pending.set(conversationId, result)
    void result.finally(() => {
      if (this.#pending.get(conversationId) === result)
        this.#pending.delete(conversationId)
    }).catch(() => {})
    return result
  }
}
