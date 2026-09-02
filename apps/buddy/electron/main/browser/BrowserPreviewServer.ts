import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'

interface BrowserPreviewMountInput {
  entryPath: string
  ownerSessionId: string
  rootPath: string
}

interface BrowserPreviewMount {
  entryUrl: string
  token: string
}

interface BrowserPreviewServerOptions {
  createToken?: () => string
  idleTtlMs?: number
  maxMounts?: number
  now?: () => number
}

interface MountRecord {
  activeRequests: number
  lastAccessedAt: number
  ownerSessionId: string
  rootPath: string
  token: string
}

const HTML_CONTENT_SECURITY_POLICY = [
  'default-src \'self\'',
  'script-src \'self\' \'unsafe-inline\' blob:',
  'style-src \'self\' \'unsafe-inline\'',
  'img-src \'self\' data: blob:',
  'font-src \'self\' data:',
  'connect-src \'self\'',
  'worker-src \'self\' blob:',
  'object-src \'none\'',
  'base-uri \'none\'',
  'form-action \'none\'',
  'frame-src \'none\'',
  'frame-ancestors \'none\'',
].join('; ')

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
}

const DEFAULT_IDLE_TTL_MS = 30 * 60 * 1_000
const DEFAULT_MAX_MOUNTS = 64
const MAX_FILE_SIZE_BYTES = 32 * 1_024 * 1_024
const MIME_TYPES = new Map([
  ['.avif', 'image/avif'],
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.htm', 'text/html; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.mp3', 'audio/mpeg'],
  ['.mp4', 'video/mp4'],
  ['.ogg', 'audio/ogg'],
  ['.otf', 'font/otf'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ttf', 'font/ttf'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.webm', 'video/webm'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

export class BrowserPreviewServer {
  readonly #createToken: () => string
  readonly #idleTtlMs: number
  readonly #maxMounts: number
  readonly #mounts = new Map<string, MountRecord>()
  readonly #now: () => number
  #authority: string | null = null
  #disposed = false
  #disposePromise: Promise<void> | null = null
  #origin: string | null = null
  #server: Server | null = null
  #startPromise: Promise<void> | null = null

  constructor(options: BrowserPreviewServerOptions = {}) {
    this.#createToken = options.createToken ?? (() => randomBytes(16).toString('hex'))
    this.#idleTtlMs = options.idleTtlMs ?? DEFAULT_IDLE_TTL_MS
    this.#maxMounts = options.maxMounts ?? DEFAULT_MAX_MOUNTS
    this.#now = options.now ?? Date.now
    if (this.#idleTtlMs <= 0)
      throw new RangeError('Browser preview idle TTL must be positive')
    if (!Number.isInteger(this.#maxMounts) || this.#maxMounts <= 0)
      throw new RangeError('Browser preview mount limit must be a positive integer')
  }

  async mount(input: BrowserPreviewMountInput): Promise<BrowserPreviewMount> {
    this.#assertActive()
    const rootPath = await realpath(input.rootPath)
    const entryPath = await realpath(input.entryPath)
    const entryStat = await stat(entryPath)
    const entryRelativePath = relative(rootPath, entryPath)
    const entryExtension = extname(entryPath).toLowerCase()
    if (
      !entryStat.isFile()
      || (entryExtension !== '.htm' && entryExtension !== '.html')
      || !entryRelativePath
      || !isContainedPath(rootPath, entryPath)
      || hasUnsafePathSegment(entryRelativePath)
    ) {
      throw new Error('Browser preview entry must be an HTML file inside its root')
    }

    await this.#start()
    this.#assertActive()
    this.#sweepExpired()
    this.#evictAtCapacity()
    const token = this.#generateToken()
    this.#mounts.set(token, {
      activeRequests: 0,
      lastAccessedAt: this.#now(),
      ownerSessionId: input.ownerSessionId,
      rootPath,
      token,
    })
    const encodedPath = entryRelativePath
      .split(sep)
      .map(segment => encodeURIComponent(segment))
      .join('/')
    return {
      entryUrl: `${this.#origin}/preview/${token}/${encodedPath}`,
      token,
    }
  }

  revoke(token: string): boolean {
    return this.#mounts.delete(token)
  }

  revokeSession(ownerSessionId: string): void {
    for (const [token, mount] of this.#mounts) {
      if (mount.ownerSessionId === ownerSessionId)
        this.#mounts.delete(token)
    }
  }

  dispose(): Promise<void> {
    if (this.#disposePromise)
      return this.#disposePromise
    this.#disposed = true
    this.#disposePromise = this.#close()
    return this.#disposePromise
  }

  async #close(): Promise<void> {
    await this.#startPromise?.catch(() => {})
    this.#mounts.clear()
    const server = this.#server
    this.#server = null
    this.#authority = null
    this.#origin = null
    if (!server)
      return
    await new Promise<void>((resolvePromise, reject) => {
      server.close((error) => {
        if (error)
          reject(error)
        else
          resolvePromise()
      })
      server.closeAllConnections()
    })
  }

  async #start(): Promise<void> {
    this.#assertActive()
    if (this.#server)
      return
    if (!this.#startPromise) {
      const startPromise = this.#listen()
      this.#startPromise = startPromise
      const clearStartPromise = () => {
        if (this.#startPromise === startPromise)
          this.#startPromise = null
      }
      void startPromise.then(clearStartPromise, clearStartPromise)
    }
    await this.#startPromise
  }

  #assertActive(): void {
    if (this.#disposed)
      throw new Error('Browser preview server is disposed')
  }

  async #listen(): Promise<void> {
    const server = createServer((request, response) => {
      void this.#handleRequest(request, response)
    })
    await new Promise<void>((resolvePromise, reject) => {
      const handleError = (error: Error) => {
        reject(error)
      }
      server.once('error', handleError)
      server.listen(0, '127.0.0.1', () => {
        server.off('error', handleError)
        resolvePromise()
      })
    })
    const address = server.address() as AddressInfo
    this.#server = server
    this.#authority = `127.0.0.1:${address.port}`
    this.#origin = `http://${this.#authority}`
  }

  #evictAtCapacity(): void {
    if (this.#mounts.size < this.#maxMounts)
      return
    let candidate: MountRecord | null = null
    for (const mount of this.#mounts.values()) {
      if (mount.activeRequests > 0)
        continue
      if (!candidate || mount.lastAccessedAt < candidate.lastAccessedAt)
        candidate = mount
    }
    if (!candidate)
      throw new Error('Every browser preview mount is currently active')
    this.#mounts.delete(candidate.token)
  }

  #generateToken(): string {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const token = this.#createToken()
      if (!/^[a-f0-9]{32}$/.test(token))
        throw new Error('Browser preview capability must contain 128 random bits')
      if (!this.#mounts.has(token))
        return token
    }
    throw new Error('Unable to allocate a unique browser preview capability')
  }

  #sweepExpired(): void {
    const now = this.#now()
    for (const [token, mount] of this.#mounts) {
      if (mount.activeRequests === 0 && this.#isExpired(mount, now))
        this.#mounts.delete(token)
    }
  }

  #isExpired(mount: MountRecord, now = this.#now()): boolean {
    return now - mount.lastAccessedAt >= this.#idleTtlMs
  }

  async #handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.headers.host !== this.#authority) {
      response.writeHead(421, SECURITY_HEADERS).end()
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, {
        ...SECURITY_HEADERS,
        Allow: 'GET, HEAD',
      }).end()
      return
    }

    const path = (request.url ?? '/').split('?', 1)[0]
    const match = path.match(/^\/preview\/([a-f0-9]{32})\/(.+)$/)
    if (!match) {
      response.writeHead(404).end()
      return
    }
    this.#sweepExpired()
    const mount = this.#mounts.get(match[1])
    if (!mount || this.#isExpired(mount)) {
      response.writeHead(404).end()
      return
    }
    mount.activeRequests += 1
    try {
      const asset = await resolvePreviewAsset(mount.rootPath, match[2])
      if (!asset.ok) {
        response.writeHead(asset.statusCode, SECURITY_HEADERS).end()
        return
      }
      mount.lastAccessedAt = this.#now()
      const headers: Record<string, number | string> = {
        ...SECURITY_HEADERS,
        'Content-Length': asset.size,
        'Content-Type': asset.mimeType,
      }
      if (asset.hasActiveDocumentContent)
        headers['Content-Security-Policy'] = HTML_CONTENT_SECURITY_POLICY
      response.writeHead(200, {
        ...headers,
      })
      if (request.method === 'HEAD') {
        response.end()
        return
      }
      await pipeline(createReadStream(asset.path), response)
    }
    catch {
      if (!response.headersSent && !response.destroyed)
        response.writeHead(404, SECURITY_HEADERS).end()
    }
    finally {
      mount.activeRequests -= 1
    }
  }
}

interface ResolvedPreviewAsset {
  hasActiveDocumentContent: boolean
  mimeType: string
  ok: true
  path: string
  size: number
}

interface RejectedPreviewAsset {
  ok: false
  statusCode: 404 | 413 | 415
}

async function resolvePreviewAsset(
  rootPath: string,
  rawRelativePath: string,
): Promise<RejectedPreviewAsset | ResolvedPreviewAsset> {
  let relativePath: string
  try {
    relativePath = decodeURIComponent(rawRelativePath)
  }
  catch {
    return { ok: false, statusCode: 404 }
  }
  if (
    !relativePath
    || relativePath.includes('\0')
    || relativePath.includes('\\')
    || isAbsolute(relativePath)
    || /^[a-z]:/i.test(relativePath)
    || hasUnsafePathSegment(relativePath)
  ) {
    return { ok: false, statusCode: 404 }
  }

  let path: string
  try {
    path = await realpath(resolve(rootPath, relativePath))
  }
  catch {
    return { ok: false, statusCode: 404 }
  }
  if (!isContainedPath(rootPath, path))
    return { ok: false, statusCode: 404 }

  const pathStat = await stat(path).catch(() => null)
  if (!pathStat?.isFile())
    return { ok: false, statusCode: 404 }
  if (pathStat.size > MAX_FILE_SIZE_BYTES)
    return { ok: false, statusCode: 413 }

  const extension = extname(path).toLowerCase()
  const mimeType = MIME_TYPES.get(extension)
  if (!mimeType)
    return { ok: false, statusCode: 415 }
  return {
    hasActiveDocumentContent: extension === '.htm'
      || extension === '.html'
      || extension === '.svg',
    mimeType,
    ok: true,
    path,
    size: pathStat.size,
  }
}

function hasUnsafePathSegment(path: string): boolean {
  return path
    .split(/[\\/]/)
    .some(segment => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))
}

function isContainedPath(rootPath: string, path: string): boolean {
  const pathFromRoot = relative(rootPath, path)
  return Boolean(pathFromRoot)
    && pathFromRoot !== '..'
    && !pathFromRoot.startsWith(`..${sep}`)
    && !isAbsolute(pathFromRoot)
}
