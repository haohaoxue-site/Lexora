import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import type { ConnectorCredential, OAuthConnectorCredential } from '../../../../shared/connectors/connectorCredentials'
import type { ConnectorErrorCode, ConnectorRuntimeState, ConnectorToolSummary } from '../../../../shared/connectors/connectorState'
import type { RuntimeRpcPeerContract } from '../../../../shared/runtime/rpcPeer'
import type { BuddyToolClassification } from '../../approvals/toolClassification'
import type { ConnectorRepository, McpServerRecord } from '../../storage/connectorRepository'
import type { McpServerConfig } from './mcpSchemas'
import type { McpResultWriter } from './mcpToolResults'
import { connectorCredentialSchema } from '../../../../shared/connectors/connectorCredentials'
import { credentialMutationResultSchema, credentialReadResultSchema } from '../../../../shared/runtime/credentialProtocol'
import { createMcpTools } from './createMcpTools'
import { McpConnectionManager } from './McpConnectionManager'
import { McpClientError, mcpErrorCode } from './mcpErrors'
import { loginMcpOAuth, McpOAuthProvider } from './McpOAuthProvider'
import { mcpServerConfigSchema } from './mcpSchemas'
import { waitForMcpOperation } from './waitForMcpOperation'

export interface ConnectorSecretStore {
  delete: (id: string) => Promise<void>
  read: (id: string) => Promise<ConnectorCredential | null>
  write: (id: string, credential: ConnectorCredential) => Promise<void>
}

export interface BuddyConnectorEvent {
  code?: ConnectorErrorCode
  connectorId: string
  type: 'connector.tools_changed' | 'connector.unavailable'
}

export interface McpConnectorServiceOptions {
  connectors: ConnectorRepository
  invalidateSessions?: () => Promise<unknown> | unknown
  maxReconnectAttempts?: number
  notify?: (event: BuddyConnectorEvent) => void
  secrets: ConnectorSecretStore
  openExternal?: (url: string) => Promise<void>
}

export interface BuddyMcpTools {
  classifications: Map<string, BuddyToolClassification>
  diagnostics: Array<{ code: string, message: string }>
  tools: ToolDefinition[]
  available: (name: string) => boolean
}

export type ConnectorCredentialMutation
  = | { mode: 'keep' }
    | { mode: 'clear' }
    | { mode: 'replace', value: ConnectorCredential }

export interface SaveMcpConnectorInput {
  config: McpServerConfig
  credential: ConnectorCredentialMutation
}

export class McpConnectorService {
  readonly #connectors: ConnectorRepository
  readonly #options: McpConnectorServiceOptions
  readonly #secrets: ConnectorSecretStore
  readonly #manager: McpConnectionManager
  readonly #mutations = new Map<string, Promise<unknown>>()
  readonly #secretWrites = new Map<string, Promise<unknown>>()
  readonly #logins = new Map<string, { controller: AbortController, operation: Promise<void> }>()
  #closed = false

  constructor(options: McpConnectorServiceOptions) {
    this.#options = options
    this.#connectors = options.connectors
    this.#secrets = options.secrets
    this.#manager = new McpConnectionManager({
      repository: options.connectors,
      config: toConfig,
      readCredential: id => options.secrets.read(id),
      authProvider: (record, credential, signal) => {
        const generation = this.#manager.generation(record.id)
        return credential?.type === 'oauth'
          ? new McpOAuthProvider({ credential, signal, save: value => this.#saveOAuth(record, generation, signal, value) })
          : undefined
      },
      changed: () => options.invalidateSessions?.(),
      unavailable: (connectorId, code) => options.notify?.({ connectorId, code, type: 'connector.unavailable' }),
      maxReconnectAttempts: options.maxReconnectAttempts,
    })
  }

  start(): void { this.#manager.start() }
  async prepareForRun(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    const pending = this.list().filter(record => this.#manager.available(record.id, this.#manager.generation(record.id)) && this.state(record.id).updatedAt === null).map(record => this.#manager.refresh(record.id))
    await waitForMcpOperation(Promise.allSettled(pending), signal)
    signal.throwIfAborted()
  }

  list(): readonly McpServerRecord[] { return this.#connectors.list() }
  state(id: string): ConnectorRuntimeState { return this.#manager.state(id) }
  tools(id: string): ConnectorToolSummary[] {
    this.#requireConnector(id)
    return this.#manager.catalog(id).map(tool => ({ name: tool.name, title: tool.title ?? tool.annotations?.title ?? tool.name, description: tool.description ?? '', readOnly: tool.annotations?.readOnlyHint === true }))
  }

  upsert(input: McpServerConfig): Promise<McpServerRecord> {
    return this.save({ config: input, credential: { mode: 'keep' } })
  }

  async save(input: SaveMcpConnectorInput): Promise<McpServerRecord> {
    const parsed = mcpServerConfigSchema.safeParse(input.config)
    if (!parsed.success)
      throw new McpConnectorError('VALIDATION_FAILED')
    return this.#mutate(parsed.data.id, async () => {
      const existing = this.#connectors.findById(parsed.data.id)
      const previousRef = existing?.credentialRef ?? null
      if (input.credential.mode === 'keep' && previousRef && existing && !sameTrustTarget(existing, parsed.data))
        throw new McpConnectorError('VALIDATION_FAILED')
      if (input.credential.mode === 'replace' && (!connectorCredentialSchema.safeParse(input.credential.value).success || !credentialMatchesTransport(input.credential.value, parsed.data.transport)))
        throw new McpConnectorError('VALIDATION_FAILED')
      const previous = previousRef && input.credential.mode !== 'keep' ? await this.#secrets.read(previousRef) : null
      const credentialRef = input.credential.mode === 'replace' ? previousRef ?? parsed.data.id : input.credential.mode === 'keep' ? previousRef : null
      let record: McpServerRecord
      try {
        if (input.credential.mode === 'replace')
          await this.#secrets.write(credentialRef!, input.credential.value)
        else if (input.credential.mode === 'clear' && previousRef)
          await this.#secrets.delete(previousRef)
        record = this.#persistConfig({ ...parsed.data, credentialRef }, input.credential.mode !== 'keep')
      }
      catch (error) {
        if (input.credential.mode !== 'keep')
          await this.#restoreSecret(credentialRef ?? previousRef ?? parsed.data.id, previous)
        throw error
      }
      if (!existing || !sameTrustTarget(existing, parsed.data) || input.credential.mode !== 'keep')
        this.#manager.clearCatalog(record.id)
      return record
    })
  }

  trust(id: string, trusted = true): Promise<McpServerRecord> {
    return this.#mutate(id, async () => {
      const record = this.#requireConnector(id)
      const now = new Date().toISOString()
      return this.#connectors.upsert({ ...record, trustedAt: trusted ? now : null, enabled: !trusted && record.transport === 'stdio' ? false : record.enabled, updatedAt: now })
    })
  }

  setEnabled(id: string, enabled: boolean): Promise<McpServerRecord> {
    return this.#mutate(id, async () => this.#persistConfig(toConfig({ ...this.#requireConnector(id), enabled })))
  }

  async saveCredential(id: string, credential: ConnectorCredential): Promise<void> {
    await this.#mutate(id, async () => {
      const record = this.#requireConnector(id)
      const parsed = connectorCredentialSchema.safeParse(credential)
      if (!parsed.success || !credentialMatchesTransport(parsed.data, record.transport))
        throw new McpConnectorError('VALIDATION_FAILED')
      const credentialRef = record.credentialRef ?? record.id
      const previous = await this.#secrets.read(credentialRef)
      try {
        await this.#secrets.write(credentialRef, parsed.data)
        this.#persistConfig(toConfig({ ...record, credentialRef, enabled: record.transport === 'stdio' ? false : record.enabled }), true)
      }
      catch (error) {
        await this.#restoreSecret(credentialRef, previous)
        throw error
      }
      this.#manager.clearCatalog(id)
    })
  }

  async clearCredential(id: string): Promise<void> {
    await this.#mutate(id, async () => {
      const record = this.#requireConnector(id)
      if (!record.credentialRef)
        return
      const previous = await this.#secrets.read(record.credentialRef)
      try {
        await this.#secrets.delete(record.credentialRef)
        this.#persistConfig(toConfig({ ...record, credentialRef: null, enabled: record.transport === 'stdio' ? false : record.enabled }), true)
      }
      catch (error) {
        await this.#restoreSecret(record.credentialRef, previous)
        throw error
      }
      this.#manager.clearCatalog(id)
    })
  }

  remove(id: string): Promise<boolean> {
    return this.#mutate(id, async () => {
      const record = this.#connectors.findById(id)
      if (!record)
        return false
      const previous = record.credentialRef ? await this.#secrets.read(record.credentialRef) : null
      if (record.credentialRef)
        await this.#secrets.delete(record.credentialRef)
      try {
        const removed = this.#connectors.remove(id)
        if (!removed && record.credentialRef)
          await this.#restoreSecret(record.credentialRef, previous)
        if (removed)
          this.#manager.clearCatalog(id)
        return removed
      }
      catch (error) {
        if (record.credentialRef)
          await this.#restoreSecret(record.credentialRef, previous)
        throw error
      }
    })
  }

  async test(id: string): Promise<ConnectorRuntimeState> {
    this.#requireConnector(id)
    const login = this.#logins.get(id)
    this.cancelLogin(id)
    await login?.operation
    try {
      await this.#manager.reconnect(id)
      return { ...this.state(id), status: 'ready' }
    }
    catch (error) {
      const code = mcpErrorCode(error)
      this.#manager.setState(id, code === 'MCP_AUTHENTICATION_REQUIRED' ? 'needs_auth' : 'error', code)
      return { ...this.state(id), status: code === 'MCP_AUTHENTICATION_REQUIRED' ? 'needs_auth' : 'error' }
    }
  }

  login(id: string): void {
    const record = this.#requireConnector(id)
    if (record.transport !== 'streamable-http' || !record.url || !this.#options.openExternal)
      throw new McpConnectorError('VALIDATION_FAILED')
    if (this.state(id).authorization !== 'oauth') {
      void this.test(id).catch(() => {})
      return
    }
    const previous = this.#logins.get(id)
    this.cancelLogin(id)
    const controller = new AbortController()
    const operation = Promise.resolve().then(async () => {
      await previous?.operation
      if (controller.signal.aborted)
        return
      this.#manager.pause(id)
      let generation = this.#manager.generation(id)
      try {
        await this.#manager.reset(id)
        generation = this.#manager.generation(id)
        await this.#options.invalidateSessions?.()
        controller.signal.throwIfAborted()
        this.#manager.setAuthorization(id, 'oauth')
        this.#manager.setState(id, 'authenticating')
        const credential = await loginMcpOAuth({ url: record.url!, signal: controller.signal, openExternal: this.#options.openExternal! })
        if (credential)
          await this.#saveOAuth(record, generation, controller.signal, credential)
        controller.signal.throwIfAborted()
        this.#manager.clearCatalog(id)
        this.#manager.resume(id)
        await this.#manager.reconnect(id)
      }
      catch (error) {
        if (generation === this.#manager.generation(id)) {
          const code = controller.signal.aborted ? 'MCP_AUTHENTICATION_CANCELLED' : mcpErrorCode(error, 'MCP_AUTHENTICATION_FAILED')
          this.#manager.setState(id, code === 'MCP_CONNECTOR_CHANGED' ? 'error' : 'needs_auth', code)
        }
      }
      finally {
        if (this.#logins.get(id)?.controller === controller) {
          this.#logins.delete(id)
          this.#manager.resume(id)
          await this.#options.invalidateSessions?.()
        }
      }
    })
    this.#logins.set(id, { controller, operation })
  }

  cancelLogin(id: string): void {
    const login = this.#logins.get(id)
    if (!login)
      return
    login.controller.abort()
    this.#manager.setState(id, 'needs_auth', 'MCP_AUTHENTICATION_CANCELLED')
  }

  getTools(_signal?: AbortSignal, writeResult?: McpResultWriter): BuddyMcpTools {
    const classifications = new Map<string, BuddyToolClassification>()
    const diagnostics: BuddyMcpTools['diagnostics'] = []
    const tools: ToolDefinition[] = []
    const availability = new Map<string, () => boolean>()
    for (const connector of this.list().filter(record => record.enabled)) {
      const generation = this.#manager.generation(connector.id)
      if (!this.#manager.available(connector.id, generation))
        continue
      const result = createMcpTools({
        serverId: connector.id,
        serverName: connector.name,
        tools: this.#manager.catalog(connector.id),
        trusted: connector.trustedAt !== null,
        callTool: (tool, parameters, signal, onProgress) => this.#manager.callTool(connector.id, generation, tool, parameters, signal, onProgress),
        writeResult,
      })
      for (const tool of result.tools)
        availability.set(tool.name, () => this.#manager.available(connector.id, generation))
      tools.push(...result.tools)
      diagnostics.push(...result.diagnostics)
      for (const [name, classification] of result.classifications)
        classifications.set(name, classification)
    }
    return { classifications, diagnostics, tools, available: name => availability.get(name)?.() ?? false }
  }

  async close(): Promise<void> {
    this.#closed = true
    for (const login of this.#logins.values())
      login.controller.abort()
    await Promise.allSettled([...this.#logins.values()].map(login => login.operation))
    await Promise.allSettled([...this.#mutations.values(), ...this.#secretWrites.values()])
    await this.#manager.close()
  }

  #mutate<T>(id: string, action: () => Promise<T>): Promise<T> {
    return enqueue(this.#mutations, id, async () => {
      if (this.#closed)
        throw new McpClientError('MCP_SERVER_UNAVAILABLE')
      const login = this.#logins.get(id)
      this.cancelLogin(id)
      await login?.operation
      this.#manager.pause(id)
      try {
        await this.#manager.reset(id)
        return await enqueue(this.#secretWrites, id, action)
      }
      finally {
        this.#manager.resume(id)
        await this.#options.invalidateSessions?.()
        this.#options.notify?.({ code: 'MCP_CONNECTOR_CHANGED', connectorId: id, type: 'connector.tools_changed' })
        if (!this.#closed)
          this.#manager.warm(id)
      }
    })
  }

  #saveOAuth(target: McpServerRecord, generation: number, signal: AbortSignal, credential: OAuthConnectorCredential): Promise<void> {
    const id = target.id
    return enqueue(this.#secretWrites, id, async () => {
      signal.throwIfAborted()
      if (this.#closed || generation !== this.#manager.generation(id))
        throw new McpClientError('MCP_CONNECTOR_CHANGED')
      const record = this.#requireConnector(id)
      if (record.transport !== 'streamable-http' || record.url !== target.url)
        throw new McpClientError('MCP_CONNECTOR_CHANGED')
      const ref = record.credentialRef ?? record.id
      const previous = await this.#secrets.read(ref)
      try {
        signal.throwIfAborted()
        await this.#secrets.write(ref, credential)
        signal.throwIfAborted()
        if (generation !== this.#manager.generation(id))
          throw new McpClientError('MCP_CONNECTOR_CHANGED')
        this.#connectors.upsert({ ...record, credentialRef: ref, updatedAt: new Date().toISOString() })
      }
      catch (error) {
        await this.#restoreSecret(ref, previous)
        throw error
      }
    })
  }

  #persistConfig(input: McpServerConfig, credentialChanged = false): McpServerRecord {
    const parsed = mcpServerConfigSchema.safeParse(input)
    if (!parsed.success)
      throw new McpConnectorError('VALIDATION_FAILED')
    const existing = this.#connectors.findById(parsed.data.id)
    const trustedAt = existing && sameTrustTarget(existing, parsed.data) && !(credentialChanged && parsed.data.transport === 'stdio') ? existing.trustedAt : null
    if (parsed.data.transport === 'stdio' && parsed.data.enabled && !trustedAt)
      throw new McpConnectorError('MCP_CONNECTOR_TRUST_REQUIRED')
    const now = new Date().toISOString()
    return this.#connectors.upsert(toRecord(parsed.data, existing?.createdAt ?? now, now, trustedAt))
  }

  async #restoreSecret(id: string, credential: ConnectorCredential | null): Promise<void> {
    if (credential)
      await this.#secrets.write(id, credential)
    else
      await this.#secrets.delete(id)
  }

  #requireConnector(id: string): McpServerRecord {
    const record = this.#connectors.findById(id)
    if (!record)
      throw new McpConnectorError('MCP_CONNECTOR_NOT_FOUND')
    return record
  }
}

function enqueue<T>(queue: Map<string, Promise<unknown>>, id: string, action: () => Promise<T>): Promise<T> {
  const operation = (queue.get(id) ?? Promise.resolve()).catch(() => {}).then(action)
  queue.set(id, operation)
  void operation.finally(() => {
    if (queue.get(id) === operation)
      queue.delete(id)
  }).catch(() => {})
  return operation
}

export class HostConnectorSecretStore implements ConnectorSecretStore {
  readonly #peer: RuntimeRpcPeerContract

  constructor(peer: RuntimeRpcPeerContract) {
    this.#peer = peer
  }

  async read(id: string): Promise<ConnectorCredential | null> {
    const response = credentialReadResultSchema.parse(await this.#peer.request(
      'host.secrets.read',
      { id, namespace: 'connectors' },
    ))
    if (!response.ok)
      throw new McpConnectorError(response.error.code)
    return response.value === null ? null : connectorCredentialSchema.parse(response.value)
  }

  async write(id: string, credential: ConnectorCredential): Promise<void> {
    const response = credentialMutationResultSchema.parse(await this.#peer.request(
      'host.secrets.write',
      { id, namespace: 'connectors', value: connectorCredentialSchema.parse(credential) },
    ))
    if (!response.ok)
      throw new McpConnectorError(response.error.code)
  }

  async delete(id: string): Promise<void> {
    const response = credentialMutationResultSchema.parse(await this.#peer.request(
      'host.secrets.delete',
      { id, namespace: 'connectors' },
    ))
    if (!response.ok)
      throw new McpConnectorError(response.error.code)
  }
}

export class McpConnectorError extends Error {
  readonly code: string

  constructor(code: string) {
    super('Lexora Buddy connector configuration is invalid')
    this.name = 'McpConnectorError'
    this.code = code
  }
}

function toRecord(
  config: McpServerConfig,
  createdAt: string,
  updatedAt: string,
  trustedAt: string | null,
): McpServerRecord {
  return config.transport === 'stdio'
    ? {
        ...config,
        createdAt,
        trustedAt,
        updatedAt,
        url: null,
      }
    : {
        ...config,
        args: null,
        command: null,
        createdAt,
        cwd: null,
        trustedAt,
        updatedAt,
      }
}

function toConfig(record: McpServerRecord): McpServerConfig {
  if (record.transport === 'stdio') {
    if (!record.command || !record.args)
      throw new McpConnectorError('VALIDATION_FAILED')
    return mcpServerConfigSchema.parse({
      args: record.args,
      command: record.command,
      credentialRef: record.credentialRef,
      cwd: record.cwd,
      enabled: record.enabled,
      id: record.id,
      name: record.name,
      transport: record.transport,
    })
  }
  if (!record.url)
    throw new McpConnectorError('VALIDATION_FAILED')
  return mcpServerConfigSchema.parse({
    credentialRef: record.credentialRef,
    enabled: record.enabled,
    id: record.id,
    name: record.name,
    transport: record.transport,
    url: record.url,
  })
}

function sameTrustTarget(record: McpServerRecord, config: McpServerConfig): boolean {
  if (record.transport !== config.transport)
    return false
  if (config.transport === 'stdio') {
    return record.command === config.command
      && JSON.stringify(record.args) === JSON.stringify(config.args)
      && record.cwd === config.cwd
  }
  return record.url === config.url
}

function credentialMatchesTransport(
  credential: ConnectorCredential,
  transport: McpServerRecord['transport'],
): boolean {
  return transport === 'stdio' ? credential.type === 'stdio' : credential.type === 'http' || credential.type === 'oauth'
}
