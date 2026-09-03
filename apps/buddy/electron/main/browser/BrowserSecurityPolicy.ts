import type { BrowserFailureReason } from '../../../shared/browserProtocol'
import type { DesktopBrowserErrorCode } from '../../shared/desktopApi'
import { realpath, stat } from 'node:fs/promises'
import { isIP } from 'node:net'
import { extname, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export interface BrowserSecurityPage {
  id: number
  debugger: {
    attach: (protocolVersion?: string) => void
    detach: () => void
    isAttached: () => boolean
    sendCommand: (
      method: string,
      commandParams?: Record<string, unknown>,
    ) => Promise<unknown>
  }
  getURL: () => string
  loadURL: (url: string) => Promise<unknown>
  setWindowOpenHandler: (handler: () => { action: 'deny' }) => void
}

export interface BrowserSecuritySession {
  clearCache: () => Promise<void>
  clearStorageData: () => Promise<void>
  flushStorageData: () => void
  off: ((event: 'certificate-error', listener: CertificateErrorListener) => unknown) & ((event: 'will-download', listener: DownloadListener) => unknown)
  on: ((event: 'certificate-error', listener: CertificateErrorListener) => unknown) & ((event: 'will-download', listener: DownloadListener) => unknown)
  resolveHost: (
    hostname: string,
    options: { cacheUsage: 'allowed' | 'disallowed' },
  ) => Promise<{ endpoints: Array<{ address: string }> }>
  setPermissionCheckHandler: (
    handler: null | ((...args: never[]) => boolean),
  ) => void
  setPermissionRequestHandler: (
    handler: null | ((
      webContents: unknown,
      permission: unknown,
      callback: (allowed: boolean) => void,
    ) => void),
  ) => void
  webRequest: {
    onBeforeRequest: {
      (listener: BeforeRequestListener | null): void
      (filter: { urls: string[] }, listener: BeforeRequestListener | null): void
    }
  }
}

interface BrowserSecurityPolicyOptions {
  onCertificateError?: (details: BrowserCertificateErrorDetails) => void
  onPermissionDenied?: () => void
  onRequestBlocked?: (details: BrowserRequestDetails) => void
  page: BrowserSecurityPage
  session: BrowserSecuritySession
}

interface BrowserRequestDetails {
  resourceType: string
  url: string
  webContentsId: number
}

interface BrowserCertificateErrorDetails {
  error: string
  url: string
}

interface DownloadEvent {
  preventDefault: () => void
}

type DownloadListener = (
  event: DownloadEvent,
  item: unknown,
  webContents: unknown,
) => void

type CertificateErrorListener = (
  event: unknown,
  webContents: unknown,
  url: string,
  error: string,
  certificate: unknown,
  callback: (isTrusted: boolean) => void,
  isMainFrame: boolean,
) => void

type BeforeRequestListener = (
  details: BrowserRequestDetails,
  callback: (response: { cancel: boolean }) => void,
) => void

interface ResolutionCacheEntry {
  allowed: boolean
  expiresAt: number
}

interface BrowserSecurityRoute {
  isRequestAllowed: (details: BrowserRequestDetails) => Promise<boolean>
  onCertificateError: (details: BrowserCertificateErrorDetails) => void
  onPermissionDenied: () => void
  onRequestBlocked: (details: BrowserRequestDetails) => void
}

const sessionSecurityCoordinators = new WeakMap<
  BrowserSecuritySession,
  BrowserSecuritySessionCoordinator
>()

class BrowserSecuritySessionCoordinator {
  readonly #beforeRequestListener: BeforeRequestListener
  readonly #certificateErrorListener: CertificateErrorListener
  readonly #downloadListener: DownloadListener
  readonly #routes = new Map<number, BrowserSecurityRoute>()
  readonly #session: BrowserSecuritySession

  constructor(session: BrowserSecuritySession) {
    this.#session = session
    this.#beforeRequestListener = (details, callback) => {
      const route = this.#routes.get(details.webContentsId)
      if (!route) {
        callback({ cancel: true })
        return
      }
      void route.isRequestAllowed(details).then((allowed) => {
        if (!allowed)
          route.onRequestBlocked(details)
        callback({ cancel: !allowed })
      }).catch(() => {
        route.onRequestBlocked(details)
        callback({ cancel: true })
      })
    }
    this.#certificateErrorListener = (
      _event,
      webContents,
      url,
      error,
      _certificate,
      callback,
      isMainFrame,
    ) => {
      callback(false)
      const route = this.#routes.get(readWebContentsId(webContents))
      if (route && isMainFrame)
        route.onCertificateError({ error: error.slice(0, 1_024), url })
    }
    this.#downloadListener = event => event.preventDefault()
    this.#session.setPermissionCheckHandler(() => false)
    this.#session.setPermissionRequestHandler((webContents, _permission, callback) => {
      callback(false)
      this.#routes.get(readWebContentsId(webContents))?.onPermissionDenied()
    })
    this.#session.webRequest.onBeforeRequest(
      { urls: ['*://*/*', 'file://*/*'] },
      this.#beforeRequestListener,
    )
    this.#session.on('certificate-error', this.#certificateErrorListener)
    this.#session.on('will-download', this.#downloadListener)
  }

  register(pageId: number, route: BrowserSecurityRoute): () => boolean {
    if (this.#routes.has(pageId))
      throw new Error(`Browser security route already exists: ${pageId}`)
    this.#routes.set(pageId, route)
    return () => {
      this.#routes.delete(pageId)
      if (this.#routes.size > 0)
        return false
      this.#session.setPermissionCheckHandler(null)
      this.#session.setPermissionRequestHandler(null)
      this.#session.webRequest.onBeforeRequest(null)
      this.#session.off('certificate-error', this.#certificateErrorListener)
      this.#session.off('will-download', this.#downloadListener)
      return true
    }
  }
}

function registerBrowserSecurityRoute(
  session: BrowserSecuritySession,
  pageId: number,
  route: BrowserSecurityRoute,
): () => void {
  const coordinator = sessionSecurityCoordinators.get(session)
    ?? new BrowserSecuritySessionCoordinator(session)
  sessionSecurityCoordinators.set(session, coordinator)
  const unregister = coordinator.register(pageId, route)
  return () => {
    if (unregister())
      sessionSecurityCoordinators.delete(session)
  }
}

function readWebContentsId(value: unknown): number {
  if (
    typeof value === 'object'
    && value !== null
    && 'id' in value
    && typeof value.id === 'number'
  ) {
    return value.id
  }
  return -1
}

const PUBLIC_RESOLUTION_TTL_MS = 30_000
const METADATA_HOSTNAMES = new Set([
  'instance-data.ec2.internal',
  'metadata.azure.internal',
  'metadata.google.internal',
  'metadata.oraclecloud.com',
])
const BLOCKED_IPV4_CIDRS = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const
const KNOWN_SYNTHETIC_DNS_IPV4_CIDRS = [
  ['198.18.0.0', 15],
] as const

export class BrowserSecurityPolicyError extends Error {
  readonly code: DesktopBrowserErrorCode = 'BROWSER_NAVIGATION_BLOCKED'
  readonly reason: BrowserFailureReason

  constructor(reason: BrowserFailureReason, message: string) {
    super(message)
    this.name = 'BrowserSecurityPolicyError'
    this.reason = reason
  }
}

export class BrowserSecurityPolicy {
  readonly #onCertificateError: (details: BrowserCertificateErrorDetails) => void
  readonly #onPermissionDenied: () => void
  readonly #onRequestBlocked: (details: BrowserRequestDetails) => void
  readonly #page: BrowserSecurityPage
  readonly #resolutionCache = new Map<string, ResolutionCacheEntry>()
  readonly #releaseSessionPolicy: () => void
  readonly #session: BrowserSecuritySession
  #disposed = false
  #fileChooserGuardPromise: Promise<void> | null = null
  #localAuthority: string | null = null
  #localFileRoot: string | null = null
  #ownsDebugger = false

  constructor(options: BrowserSecurityPolicyOptions) {
    this.#onCertificateError = options.onCertificateError ?? (() => {})
    this.#onPermissionDenied = options.onPermissionDenied ?? (() => {})
    this.#onRequestBlocked = options.onRequestBlocked ?? (() => {})
    this.#page = options.page
    this.#session = options.session
    this.#releaseSessionPolicy = registerBrowserSecurityRoute(
      this.#session,
      this.#page.id,
      {
        isRequestAllowed: details => this.#isRequestAllowed(details),
        onCertificateError: details => this.#onCertificateError(details),
        onPermissionDenied: () => this.#onPermissionDenied(),
        onRequestBlocked: details => this.#onRequestBlocked(details),
      },
    )
    this.#page.setWindowOpenHandler(() => ({ action: 'deny' }))
  }

  async authorizeNavigation(rawUrl: string): Promise<string> {
    this.#assertActive()
    await this.#ensureFileChooserGuard()
    const url = parseBrowserUrl(rawUrl)
    if (!url || url.username || url.password) {
      throw new BrowserSecurityPolicyError(
        'INVALID_TARGET',
        'Browser navigation target is invalid',
      )
    }

    if (isLoopbackUrl(url)) {
      this.#localAuthority = url.host
      this.#localFileRoot = null
      return url.toString()
    }
    if (url.protocol !== 'https:')
      throw new BrowserSecurityPolicyError('HTTPS_REQUIRED', 'Browser navigation requires HTTPS')
    await this.#assertAllowedHostname(url.hostname)

    this.#localAuthority = null
    this.#localFileRoot = null
    return url.toString()
  }

  async authorizeLocalFile(entryPath: string, rootPath: string): Promise<string> {
    this.#assertActive()
    await this.#ensureFileChooserGuard()
    let entry: string
    let root: string
    try {
      [entry, root] = await Promise.all([
        realpath(entryPath),
        realpath(rootPath),
      ])
      const [entryMetadata, rootMetadata] = await Promise.all([
        stat(entry),
        stat(root),
      ])
      const extension = extname(entry).toLowerCase()
      if (
        !entryMetadata.isFile()
        || !rootMetadata.isDirectory()
        || (extension !== '.html' && extension !== '.htm')
        || !containsPath(root, entry)
      ) {
        throw new Error('invalid local file')
      }
    }
    catch {
      throw new BrowserSecurityPolicyError(
        'INVALID_TARGET',
        'Browser local file target is invalid',
      )
    }
    this.#localAuthority = null
    this.#localFileRoot = root
    return pathToFileURL(entry).toString()
  }

  dispose(): void {
    if (this.#disposed)
      return
    this.#disposed = true
    this.#releaseSessionPolicy()
    if (this.#ownsDebugger && this.#page.debugger.isAttached())
      this.#page.debugger.detach()
    this.#ownsDebugger = false
    this.#resolutionCache.clear()
    this.#localFileRoot = null
  }

  #assertActive(): void {
    if (this.#disposed)
      throw new Error('Browser security policy is disposed')
  }

  async #ensureFileChooserGuard(): Promise<void> {
    if (!this.#fileChooserGuardPromise)
      this.#fileChooserGuardPromise = this.#installFileChooserGuard()
    try {
      await this.#fileChooserGuardPromise
    }
    catch {
      if (this.#ownsDebugger && this.#page.debugger.isAttached())
        this.#page.debugger.detach()
      this.#ownsDebugger = false
      throw new BrowserSecurityPolicyError(
        'FILE_CHOOSER_GUARD_UNAVAILABLE',
        'Browser file chooser guard is unavailable',
      )
    }
  }

  async #installFileChooserGuard(): Promise<void> {
    if (!this.#page.getURL())
      await this.#page.loadURL('about:blank')
    if (!this.#page.debugger.isAttached()) {
      this.#page.debugger.attach('1.3')
      this.#ownsDebugger = true
    }
    await this.#page.debugger.sendCommand('Page.enable')
    await this.#page.debugger.sendCommand(
      'Page.setInterceptFileChooserDialog',
      { cancel: true, enabled: true },
    )
  }

  async #assertAllowedHostname(rawHostname: string): Promise<void> {
    const hostname = normalizeHostname(rawHostname)
    if (!hostname || isBlockedHostname(hostname)) {
      throw new BrowserSecurityPolicyError(
        'BLOCKED_HOSTNAME',
        'Browser navigation target is blocked by hostname policy',
      )
    }

    const addressKind = isIP(hostname)
    if (addressKind > 0) {
      if (isPublicIpAddress(hostname))
        return
      throw new BrowserSecurityPolicyError(
        'NON_PUBLIC_IP_LITERAL',
        'Browser navigation target is not a public IP address',
      )
    }

    const cached = this.#resolutionCache.get(hostname)
    if (cached && cached.expiresAt > Date.now()) {
      if (cached.allowed)
        return
      throw new BrowserSecurityPolicyError(
        'NON_PUBLIC_RESOLUTION',
        'Browser hostname resolved to a non-public address',
      )
    }

    let resolution: Awaited<ReturnType<BrowserSecuritySession['resolveHost']>>
    try {
      resolution = await this.#session.resolveHost(hostname, {
        cacheUsage: cached ? 'disallowed' : 'allowed',
      })
    }
    catch {
      throw new BrowserSecurityPolicyError(
        'DNS_RESOLUTION_FAILED',
        'Browser hostname could not be resolved',
      )
    }
    const addresses = resolution.endpoints.map(endpoint => endpoint.address)
    if (addresses.length === 0) {
      throw new BrowserSecurityPolicyError(
        'DNS_RESOLUTION_FAILED',
        'Browser hostname did not resolve to an address',
      )
    }
    const allowed = addresses.every(address => (
      isPublicIpAddress(address) || isKnownSyntheticDnsAddress(address)
    ))
    this.#resolutionCache.set(hostname, {
      allowed,
      expiresAt: Date.now() + PUBLIC_RESOLUTION_TTL_MS,
    })
    if (!allowed) {
      throw new BrowserSecurityPolicyError(
        'NON_PUBLIC_RESOLUTION',
        'Browser hostname resolved to a non-public address',
      )
    }
  }

  async #isRequestAllowed(details: BrowserRequestDetails): Promise<boolean> {
    if (this.#disposed)
      return false
    const url = parseBrowserUrl(details.url, true)
    if (!url)
      return false

    if (url.protocol === 'blob:' || url.protocol === 'data:')
      return details.resourceType !== 'mainFrame'

    if (url.protocol === 'file:')
      return this.#isLocalFileAllowed(url)

    if (this.#localFileRoot !== null && details.resourceType !== 'mainFrame')
      return false

    if (isLoopbackUrl(url)) {
      const allowed = this.#localAuthority === url.host
      if (allowed && details.resourceType === 'mainFrame')
        this.#localAuthority = url.host
      if (allowed && details.resourceType === 'mainFrame')
        this.#localFileRoot = null
      return allowed
    }

    const isSecureWebRequest = url.protocol === 'https:' || url.protocol === 'wss:'
    if (!isSecureWebRequest)
      return false
    await this.#assertAllowedHostname(url.hostname)
    if (details.resourceType === 'mainFrame')
      this.#localAuthority = null
    if (details.resourceType === 'mainFrame')
      this.#localFileRoot = null
    return true
  }

  async #isLocalFileAllowed(url: URL): Promise<boolean> {
    if (!this.#localFileRoot)
      return false
    try {
      const path = await realpath(fileURLToPath(url))
      return containsPath(this.#localFileRoot, path)
    }
    catch {
      return false
    }
  }
}

function containsPath(root: string, path: string): boolean {
  const child = relative(root, path)
  return child === '' || (child !== '..' && !child.startsWith(`..${sep}`))
}

function isBlockedHostname(hostname: string): boolean {
  return hostname.endsWith('.home.arpa')
    || hostname.endsWith('.internal')
    || hostname.endsWith('.lan')
    || hostname.endsWith('.local')
    || METADATA_HOSTNAMES.has(hostname)
}

function isLoopbackUrl(url: URL): boolean {
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol))
    return false
  const hostname = normalizeHostname(url.hostname)
  if (hostname === 'localhost')
    return true
  return isIP(hostname) > 0 && isLoopbackIpAddress(hostname)
}

export function isLoopbackBrowserUrl(rawUrl: string): boolean {
  const url = parseBrowserUrl(rawUrl)
  return Boolean(url && isLoopbackUrl(url))
}

function isLoopbackIpAddress(rawAddress: string): boolean {
  const address = normalizeHostname(rawAddress)
  if (isIP(address) === 4)
    return address.startsWith('127.')
  if (isIP(address) !== 6)
    return false
  const mappedIpv4 = readMappedIpv4(address)
  return mappedIpv4 ? isLoopbackIpAddress(mappedIpv4) : address === '::1'
}

function isPublicIpAddress(rawAddress: string): boolean {
  const address = normalizeHostname(rawAddress)
  const family = isIP(address)
  if (family === 4)
    return isPublicIpv4Address(address)
  if (family !== 6)
    return false

  const mappedIpv4 = readMappedIpv4(address)
  if (mappedIpv4)
    return isPublicIpv4Address(mappedIpv4)
  if (address === '::' || address === '::1' || address.startsWith('2001:db8:'))
    return false
  const firstHextet = Number.parseInt(address.split(':', 1)[0] || '0', 16)
  return (firstHextet & 0xE000) === 0x2000
}

function isPublicIpv4Address(address: string): boolean {
  return !BLOCKED_IPV4_CIDRS.some(([network, prefix]) => (
    isIpv4InCidr(address, network, prefix)
  ))
}

function isKnownSyntheticDnsAddress(rawAddress: string): boolean {
  const address = normalizeHostname(rawAddress)
  if (isIP(address) === 4) {
    return KNOWN_SYNTHETIC_DNS_IPV4_CIDRS.some(([network, prefix]) => (
      isIpv4InCidr(address, network, prefix)
    ))
  }
  if (isIP(address) !== 6)
    return false
  const mappedIpv4 = readMappedIpv4(address)
  return mappedIpv4 ? isKnownSyntheticDnsAddress(mappedIpv4) : false
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
}

function parseBrowserUrl(rawUrl: string, allowSubresourceSchemes = false): URL | null {
  try {
    const url = new URL(rawUrl)
    const allowedProtocols = allowSubresourceSchemes
      ? ['blob:', 'data:', 'file:', 'http:', 'https:', 'ws:', 'wss:']
      : ['http:', 'https:']
    return allowedProtocols.includes(url.protocol) ? url : null
  }
  catch {
    return null
  }
}

function readMappedIpv4(address: string): string | null {
  const dotted = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1]
  if (dotted)
    return dotted
  const hexadecimal = address.match(/^::ffff:([\da-f]{1,4}):([\da-f]{1,4})$/)
  if (!hexadecimal)
    return null
  const high = Number.parseInt(hexadecimal[1], 16)
  const low = Number.parseInt(hexadecimal[2], 16)
  return `${high >>> 8}.${high & 0xFF}.${low >>> 8}.${low & 0xFF}`
}

function isIpv4InCidr(address: string, network: string, prefix: number): boolean {
  const addressValue = readIpv4(address)
  const networkValue = readIpv4(network)
  const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0
  return (addressValue & mask) >>> 0 === (networkValue & mask) >>> 0
}

function readIpv4(address: string): number {
  return address.split('.').reduce((value, octet) => (
    ((value << 8) | Number(octet)) >>> 0
  ), 0)
}
