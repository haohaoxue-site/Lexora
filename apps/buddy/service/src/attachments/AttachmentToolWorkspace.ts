import type { AttachmentRecord } from '../storage/attachmentRepository'
import { createHash } from 'node:crypto'
import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

export class AttachmentToolWorkspace {
  readonly #scratchRoot: string

  constructor(scratchRoot: string) {
    this.#scratchRoot = scratchRoot
  }

  async materialize(record: AttachmentRecord, bytes: Uint8Array): Promise<string> {
    if (await realpath(this.#scratchRoot) !== this.#scratchRoot)
      throw new Error('Attachment workspace identity changed')
    const root = join(this.#scratchRoot, '.attachments')
    const directory = join(root, createHash('sha256').update(record.id).digest('hex'))
    for (const path of [root, directory]) {
      await mkdir(path, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST')
          throw error
      })
      if (!(await lstat(path)).isDirectory() || await realpath(path) !== path)
        throw new Error('Attachment working copy directory identity changed')
    }
    const safeName = [...record.name].map(character => character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '_' : character).join('').replace(/[. ]+$/, '')
    const extension = extname(safeName)
    const name = `input-${safeName.slice(0, safeName.length - extension.length).slice(0, 64)}${extension.slice(0, 12)}`
    const path = join(directory, name)
    try {
      if (!(await lstat(path)).isFile() || await realpath(path) !== path)
        throw new Error('Attachment working copy is no longer a workspace file')
      return path
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code !== 'ENOENT')
        throw error
    }
    await writeFile(path, bytes, { flag: 'wx', mode: 0o600 })
    return path
  }
}
