import type { LocalSpaceDirectoryPage, LocalSpaceFileEntry, LocalSpaceFilePreview, SpaceDirectoryRequest, SpaceFileTarget } from '../../../shared/spaces/spaceFileApi'
import type { SpaceRepository } from '../storage/spaceRepository'
import { readdir, stat } from 'node:fs/promises'
import { extname, isAbsolute, resolve } from 'node:path'
import { readBoundedFile } from '../../../platform/filesystem/boundedFile'
import { decodeText } from '../changes/changeFileContent'
import { resolveGrantedPath } from '../directories/resolveGrantedPath'
import { BuddyServiceError } from '../rpc/runtimeRequest'
import { requireActiveSpace } from './requireActiveSpace'

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

export class SpaceFileService {
  readonly #spaces: Pick<SpaceRepository, 'findById'>

  constructor(spaces: Pick<SpaceRepository, 'findById'>) {
    this.#spaces = spaces
  }

  async list(input: SpaceDirectoryRequest): Promise<LocalSpaceDirectoryPage> {
    const target = await this.resolve(input)
    const entries = (await readdir(target.path, { withFileTypes: true }))
      .filter(entry => entry.isDirectory() || entry.isFile() || entry.isSymbolicLink())
      .sort((left, right) => Number(right.isDirectory()) - Number(left.isDirectory()) || left.name.localeCompare(right.name))
    const cursorIndex = input.cursor ? entries.findIndex(entry => entry.name === input.cursor) : -1
    const page = entries.slice(cursorIndex + 1, cursorIndex + 251)
    const result: LocalSpaceFileEntry[] = await Promise.all(page.map(async (entry) => {
      const path = input.path ? `${input.path}/${entry.name}` : entry.name
      let kind: 'directory' | 'file' = entry.isDirectory() ? 'directory' : 'file'
      let unavailable = false
      if (entry.isSymbolicLink()) {
        try {
          const resolved = await this.resolve({ ...input, path })
          kind = (await stat(resolved.path)).isDirectory() ? 'directory' : 'file'
        }
        catch {
          unavailable = true
        }
      }
      return { name: entry.name, path, kind, unavailable }
    }))
    this.requireDirectory(input)
    return { entries: result, nextCursor: cursorIndex + 1 + page.length < entries.length ? page.at(-1)?.name ?? null : null }
  }

  async read(input: SpaceFileTarget): Promise<LocalSpaceFilePreview> {
    const target = await this.resolve(input)
    const metadata = await stat(target.path)
    this.requireDirectory(input)
    if (!metadata.isFile())
      throw new BuddyServiceError('VALIDATION_FAILED')
    const mimeType = IMAGE_MIME_TYPES[extname(target.path).toLowerCase()]
    const maximum = mimeType ? 8 * 1024 * 1024 : 1024 * 1024
    if (metadata.size > maximum)
      return { kind: 'oversized', sizeBytes: metadata.size, text: null, imageUrl: null }
    const bytes = await readBoundedFile(target.root, target.path, maximum)
    this.requireDirectory(input)
    if (mimeType)
      return { kind: 'image', sizeBytes: bytes.length, text: null, imageUrl: `data:${mimeType};base64,${bytes.toString('base64')}` }
    const text = decodeText(bytes)
    return { kind: text === null ? 'binary' : 'text', sizeBytes: bytes.length, text, imageUrl: null }
  }

  async locate(input: SpaceFileTarget): Promise<{ path: string, kind: 'directory' | 'file' }> {
    const target = await this.resolve(input)
    const metadata = await stat(target.path)
    this.requireDirectory(input)
    if (!metadata.isDirectory() && !metadata.isFile())
      throw new BuddyServiceError('VALIDATION_FAILED')
    return { path: target.path, kind: metadata.isDirectory() ? 'directory' : 'file' }
  }

  private requireDirectory(input: SpaceFileTarget) {
    const space = requireActiveSpace(this.#spaces.findById(input.spaceId))
    const directory = space.primaryDirectory
    if (!directory || directory.id !== input.directoryId || directory.revision !== input.revision || directory.revokedAt)
      throw new BuddyServiceError('VALIDATION_FAILED')
    return directory
  }

  private async resolve(input: SpaceFileTarget): Promise<{ path: string, root: string }> {
    const directory = this.requireDirectory(input)
    if (isAbsolute(input.path) || input.path.includes('\\') || input.path.split('/').includes('..'))
      throw new BuddyServiceError('VALIDATION_FAILED')
    const target = await resolveGrantedPath([{
      canonicalRoot: directory.canonicalRoot,
      grantId: directory.id,
      kind: 'workspace',
      root: directory.root,
    }], resolve(directory.canonicalRoot, input.path), 'existing')
    this.requireDirectory(input)
    return { path: target.canonicalPath, root: directory.canonicalRoot }
  }
}
