import type { CallToolResult, OAuthClientProvider, Progress } from '@modelcontextprotocol/client'
import type { ConnectorCredential } from '../../../../shared/connectors/connectorCredentials'
import type { ConnectorErrorCode, ConnectorRuntimeState } from '../../../../shared/connectors/connectorState'
import type { ConnectorRepository, McpServerRecord } from '../../storage/connectorRepository'
import type { McpRemoteTool } from './McpClientSession'
import type { McpServerConfig } from './mcpSchemas'
import { mcpToolFingerprint, parseMcpCatalog, readMcpCatalog } from './mcpCatalog'
import { McpClientSession } from './McpClientSession'
import { McpClientError, mcpErrorCode } from './mcpErrors'
import { waitForMcpOperation } from './waitForMcpOperation'

interface Catalog {
  tools: McpRemoteTool[]
  updatedAt: string
}

interface Connection {
  generation: number
  controller: AbortController
  session: Promise<McpClientSession>
}

export interface McpConnectionManagerOptions {
  repository: ConnectorRepository
  readCredential: (id: string) => Promise<ConnectorCredential | null>
  authProvider: (record: McpServerRecord, credential: ConnectorCredential | null, signal: AbortSignal) => OAuthClientProvider | undefined
  config: (record: McpServerRecord) => McpServerConfig
  changed: () => Promise<unknown> | unknown
  unavailable: (id: string, code: ConnectorErrorCode) => void
  maxReconnectAttempts?: number
}

export class McpConnectionManager {
  readonly #options: McpConnectionManagerOptions
  readonly #catalogs = new Map<string, Catalog>()
  readonly #connections = new Map<string, Connection>()
  readonly #paused = new Set<string>()
  readonly #generations = new Map<string, number>()
  readonly #states = new Map<string, Pick<ConnectorRuntimeState, 'status' | 'errorCode'>>()
  readonly #authorizations = new Map<string, ConnectorRuntimeState['authorization']>()
  readonly #refreshes = new Map<string, Promise<void>>()
  readonly #background = new Set<Promise<unknown>>()
  #closed = false

  constructor(options: McpConnectionManagerOptions) {
    this.#options = options
    for (const record of options.repository.list()) {
      const catalog = options.repository.readCatalog(record.id)
      if (!catalog)
        continue
      try {
        this.#catalogs.set(record.id, { tools: readMcpCatalog(catalog.toolsJson), updatedAt: catalog.updatedAt })
      }
      catch { options.repository.clearCatalog(record.id) }
    }
  }

  start(): void {
    const ids = this.#options.repository.list().filter(record => record.enabled).map(record => record.id)
    this.#track(Promise.all(Array.from({ length: Math.min(ids.length, 3) }, async () => {
      while (!this.#closed && ids.length) {
        const id = ids.shift()!
        await this.refresh(id).catch(() => {})
      }
    })))
  }

  pause(id: string): void { this.#paused.add(id) }
  resume(id: string): void { this.#paused.delete(id) }

  clearCatalog(id: string): void {
    this.#catalogs.delete(id)
    this.#options.repository.clearCatalog(id)
  }

  warm(id: string): void {
    if (this.#options.repository.findById(id)?.enabled)
      this.#track(this.refresh(id).catch(() => {}))
  }

  generation(id: string): number {
    return this.#generations.get(id) ?? 0
  }

  catalog(id: string): readonly McpRemoteTool[] {
    return this.#catalogs.get(id)?.tools ?? []
  }

  state(id: string): ConnectorRuntimeState {
    const record = this.#options.repository.findById(id)
    const transient = this.#states.get(id)
    const status = transient?.status === 'connecting' || transient?.status === 'authenticating'
      ? transient.status
      : record?.enabled ? transient?.status ?? 'idle' : 'disabled'
    return { status, authorization: this.#authorizations.get(id) ?? null, errorCode: transient?.errorCode ?? null, toolCount: this.catalog(id).length, updatedAt: this.#catalogs.get(id)?.updatedAt ?? null }
  }

  setState(id: string, status: ConnectorRuntimeState['status'], errorCode: ConnectorErrorCode | null = null) {
    this.#states.set(id, { status, errorCode })
  }

  setAuthorization(id: string, authorization: ConnectorRuntimeState['authorization']) {
    this.#authorizations.set(id, authorization)
  }

  available(id: string, generation: number): boolean {
    const record = this.#options.repository.findById(id)
    return !this.#closed && !this.#paused.has(id) && generation === this.generation(id) && record?.enabled === true
      && (record.transport !== 'stdio' || record.trustedAt !== null)
  }

  async reset(id: string, clearCatalog = false): Promise<void> {
    this.#generations.set(id, this.generation(id) + 1)
    this.#states.delete(id)
    this.#authorizations.delete(id)
    const connection = this.#connections.get(id)
    this.#connections.delete(id)
    connection?.controller.abort(new McpClientError('MCP_CONNECTOR_CHANGED'))
    if (clearCatalog) {
      this.#catalogs.delete(id)
      this.#options.repository.clearCatalog(id)
    }
    if (connection)
      await connection.session.then(session => session.close(), () => {})
    await this.#refreshes.get(id)?.catch(() => {})
  }

  refresh(id: string): Promise<void> {
    const current = this.#refreshes.get(id)
    if (current)
      return current
    const operation = this.#refresh(id)
    this.#refreshes.set(id, operation)
    void operation.finally(() => {
      if (this.#refreshes.get(id) === operation)
        this.#refreshes.delete(id)
    }).catch(() => {})
    return operation
  }

  async #refresh(id: string): Promise<void> {
    const record = this.#requireRecord(id)
    const generation = this.generation(id)
    this.setState(id, 'connecting')
    try {
      const connection = this.#connection(record)
      const session = await connection.session
      const tools = parseMcpCatalog(await session.listTools(connection.controller.signal))
      connection.controller.signal.throwIfAborted()
      if (generation !== this.generation(id))
        return
      const previous = this.#catalogs.get(id)
      const updatedAt = new Date().toISOString()
      this.#options.repository.saveCatalog(id, JSON.stringify(tools), updatedAt)
      this.#catalogs.set(id, { tools, updatedAt })
      this.setState(id, 'ready')
      if (JSON.stringify(previous?.tools) !== JSON.stringify(tools))
        await this.#options.changed()
    }
    catch (error) {
      if (generation !== this.generation(id) || this.#closed)
        return
      const code = mcpErrorCode(error)
      this.setState(id, code === 'MCP_AUTHENTICATION_REQUIRED' ? 'needs_auth' : 'error', code)
      this.#options.unavailable(id, code)
      throw error
    }
    finally {
      if (generation === this.generation(id) && !this.#options.repository.findById(id)?.enabled) {
        const connection = this.#connections.get(id)
        this.#connections.delete(id)
        await connection?.session.then(session => session.close(), () => {})
      }
    }
  }

  async reconnect(id: string): Promise<void> {
    this.#requireRecord(id)
    await this.reset(id)
    await this.#options.changed()
    return this.refresh(id)
  }

  async callTool(id: string, generation: number, tool: McpRemoteTool, parameters: unknown, signal?: AbortSignal, onProgress?: (progress: Progress) => void): Promise<CallToolResult> {
    signal?.throwIfAborted()
    this.#assertAvailable(id, generation, tool)
    await waitForMcpOperation(this.refresh(id), signal)
    this.#assertAvailable(id, generation, tool)
    const connection = this.#connection(this.#requireRecord(id))
    const session = await connection.session
    this.#assertAvailable(id, generation, tool)
    signal?.throwIfAborted()
    const combinedSignal = signal ? AbortSignal.any([signal, connection.controller.signal]) : connection.controller.signal
    try {
      const result = await session.callTool(tool.name, parameters, combinedSignal, onProgress)
      this.setState(id, 'ready')
      return result
    }
    catch (error) {
      if (!combinedSignal.aborted) {
        const code = mcpErrorCode(error, 'MCP_TOOL_FAILED')
        if (code !== 'MCP_TOOL_FAILED')
          this.setState(id, code === 'MCP_AUTHENTICATION_REQUIRED' ? 'needs_auth' : 'error', code)
      }
      throw error
    }
  }

  async close(): Promise<void> {
    this.#closed = true
    const connections = [...this.#connections.values()]
    this.#connections.clear()
    for (const connection of connections)
      connection.controller.abort()
    const results = await Promise.allSettled(connections.map(connection => connection.session.then(session => session.close(), () => {})))
    await Promise.allSettled([...this.#refreshes.values(), ...this.#background])
    const failures = results.filter(result => result.status === 'rejected').map(result => result.reason)
    if (failures.length)
      throw new AggregateError(failures, 'MCP shutdown failed')
  }

  #connection(record: McpServerRecord): Connection {
    const existing = this.#connections.get(record.id)
    if (existing)
      return existing
    const generation = this.generation(record.id)
    const controller = new AbortController()
    const connection: Connection = {
      generation,
      controller,
      session: Promise.resolve().then(async () => {
        const credential = record.credentialRef ? await this.#options.readCredential(record.credentialRef) : null
        controller.signal.throwIfAborted()
        if (credential?.type === 'oauth')
          this.#authorizations.set(record.id, 'oauth')
        return new McpClientSession({
          config: this.#options.config(record),
          credential,
          authProvider: this.#options.authProvider(record, credential, controller.signal),
          onAuthorization: (kind) => {
            if (generation === this.generation(record.id) && !controller.signal.aborted)
              this.#authorizations.set(record.id, kind)
          },
          maxReconnectAttempts: this.#options.maxReconnectAttempts,
          onToolsChanged: () => {
            if (generation === this.generation(record.id) && !this.#closed)
              this.#track(this.refresh(record.id).catch(() => {}))
          },
          onUnavailable: (code) => {
            if (generation === this.generation(record.id) && !controller.signal.aborted) {
              this.setState(record.id, 'error', code)
              this.#options.unavailable(record.id, code)
            }
          },
        })
      }),
    }
    this.#connections.set(record.id, connection)
    return connection
  }

  #assertAvailable(id: string, generation: number, tool: McpRemoteTool): void {
    if (!this.available(id, generation))
      throw new McpClientError('MCP_CONNECTOR_DISABLED')
    const current = this.catalog(id).find(candidate => candidate.name === tool.name)
    if (!current || mcpToolFingerprint(current) !== mcpToolFingerprint(tool))
      throw new McpClientError('MCP_TOOL_CHANGED')
  }

  #requireRecord(id: string): McpServerRecord {
    const record = this.#options.repository.findById(id)
    if (this.#closed || this.#paused.has(id) || !record)
      throw new McpClientError('MCP_SERVER_UNAVAILABLE')
    if (record.transport === 'stdio' && !record.trustedAt)
      throw new McpClientError('MCP_CONNECTOR_TRUST_REQUIRED')
    return record
  }

  #track(operation: Promise<unknown>) {
    this.#background.add(operation)
    void operation.finally(() => this.#background.delete(operation)).catch(() => {})
  }
}
