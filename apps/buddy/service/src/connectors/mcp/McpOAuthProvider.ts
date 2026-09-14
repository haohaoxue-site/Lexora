import type { OAuthClientInformationContext, OAuthClientProvider, OAuthDiscoveryState, StoredOAuthClientInformation, StoredOAuthTokens } from '@modelcontextprotocol/client'
import type { OAuthConnectorCredential } from '../../../../shared/connectors/connectorCredentials'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { version } from '../../../../package.json'
import { McpClientError } from './mcpErrors'

export class McpOAuthProvider implements OAuthClientProvider {
  readonly #signal: AbortSignal
  readonly #save: (credential: OAuthConnectorCredential) => Promise<void>
  readonly #redirect?: (url: URL) => Promise<void>
  readonly #state = randomBytes(32).toString('hex')
  #credential: OAuthConnectorCredential
  #verifier?: string
  #discovery?: OAuthDiscoveryState

  constructor(options: {
    credential: OAuthConnectorCredential
    signal: AbortSignal
    save: (credential: OAuthConnectorCredential) => Promise<void>
    redirect?: (url: URL) => Promise<void>
  }) {
    this.#credential = structuredClone(options.credential)
    this.#signal = options.signal
    this.#save = options.save
    this.#redirect = options.redirect
  }

  get credential(): OAuthConnectorCredential { return structuredClone(this.#credential) }
  get redirectUrl(): string { return this.#credential.redirectUrl }
  get clientMetadata() {
    return { client_name: 'Lexora Buddy', redirect_uris: [this.redirectUrl], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }
  }

  state(): string { return this.#state }

  clientInformation(ctx?: OAuthClientInformationContext): StoredOAuthClientInformation | undefined {
    const issuer = ctx?.issuer ?? this.#credential.tokens?.issuer
    return issuer ? this.#credential.clients[issuer] : undefined
  }

  async saveClientInformation(value: StoredOAuthClientInformation, ctx?: OAuthClientInformationContext) {
    const issuer = value.issuer ?? ctx?.issuer
    if (!issuer)
      throw new McpClientError('MCP_AUTHENTICATION_FAILED')
    this.#credential.clients[issuer] = { ...value, issuer }
    await this.#persist()
  }

  tokens(ctx?: OAuthClientInformationContext): StoredOAuthTokens | undefined {
    const tokens = this.#credential.tokens
    return tokens && (!ctx || tokens.issuer === ctx.issuer) ? tokens : undefined
  }

  async saveTokens(value: StoredOAuthTokens, ctx?: OAuthClientInformationContext) {
    const issuer = value.issuer ?? ctx?.issuer
    if (!issuer)
      throw new McpClientError('MCP_AUTHENTICATION_FAILED')
    this.#credential.tokens = { ...value, issuer }
    await this.#persist()
  }

  async redirectToAuthorization(url: URL) {
    this.#signal.throwIfAborted()
    if (!this.#redirect)
      throw new McpClientError('MCP_AUTHENTICATION_REQUIRED')
    await this.#redirect(url)
  }

  saveCodeVerifier(value: string) { this.#verifier = value }
  codeVerifier(): string {
    if (!this.#verifier)
      throw new McpClientError('MCP_AUTHENTICATION_FAILED')
    return this.#verifier
  }

  discoveryState(): OAuthDiscoveryState | undefined { return this.#discovery }
  saveDiscoveryState(value: OAuthDiscoveryState) { this.#discovery = value }

  async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery') {
    if (scope === 'all' || scope === 'tokens')
      this.#credential.tokens = null
    if (scope === 'all' || scope === 'client')
      this.#credential.clients = {}
    if (scope === 'all' || scope === 'verifier')
      this.#verifier = undefined
    if (scope === 'all' || scope === 'discovery')
      this.#discovery = undefined
    await this.#persist()
  }

  async #persist() {
    this.#signal.throwIfAborted()
    await this.#save(this.credential)
  }
}

export async function loginMcpOAuth(options: {
  url: string
  signal: AbortSignal
  openExternal: (url: string) => Promise<void>
}): Promise<OAuthConnectorCredential | null> {
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(180_000)])
  let provider: McpOAuthProvider | undefined
  const callback = Promise.withResolvers<URLSearchParams>()
  void callback.promise.catch(() => {})
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const valid = request.method === 'GET' && url.pathname === '/oauth/callback'
      && provider && url.searchParams.get('state') === provider.state()
      && request.headers.host === new URL(provider.redirectUrl).host
    response.setHeader('Content-Type', 'text/plain; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    if (!valid) {
      response.writeHead(400).end('Invalid authorization callback')
      return
    }
    response.end('授权回调已收到，可以关闭此页面并返回 Lexora。')
    if (url.searchParams.has('error') || !url.searchParams.get('code'))
      callback.reject(new McpClientError('MCP_AUTHENTICATION_FAILED'))
    else
      callback.resolve(url.searchParams)
  })
  const abort = () => callback.reject(new McpClientError('MCP_AUTHENTICATION_CANCELLED'))
  signal.addEventListener('abort', abort, { once: true })
  let client: Client | undefined
  try {
    signal.throwIfAborted()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject)
        resolve()
      })
    })
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new McpClientError('MCP_AUTHENTICATION_FAILED')
    let redirected = false
    provider = new McpOAuthProvider({
      credential: { type: 'oauth', redirectUrl: `http://127.0.0.1:${address.port}/oauth/callback`, clients: {}, tokens: null },
      signal,
      save: async () => {},
      redirect: async (url) => {
        await options.openExternal(url.href)
        redirected = true
      },
    })
    const transport = new StreamableHTTPClientTransport(new URL(options.url), {
      authProvider: provider,
      requestInit: { redirect: 'error' },
      fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal }),
    })
    client = new Client({ name: 'lexora-buddy', version }, { versionNegotiation: { mode: 'auto', probe: { timeoutMs: 10_000, maxRetries: 0 } } })
    try {
      await client.connect(transport, { signal, timeout: 30_000 })
    }
    catch (error) {
      if (!redirected)
        throw error
    }
    if (redirected)
      await transport.finishAuth(await callback.promise)
    signal.throwIfAborted()
    if (!redirected && !provider.tokens())
      return null
    if (!provider.tokens())
      throw new McpClientError('MCP_AUTHENTICATION_FAILED')
    return provider.credential
  }
  finally {
    signal.removeEventListener('abort', abort)
    server.closeAllConnections()
    await Promise.allSettled([
      client?.close(),
      new Promise<void>(resolve => server.close(() => resolve())),
    ])
  }
}
