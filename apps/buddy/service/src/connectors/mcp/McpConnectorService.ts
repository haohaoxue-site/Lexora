import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import type { RuntimeRpcPeerContract } from '../../../../shared/runtimeRpcPeer'
import type { BuddyToolClassification } from '../../approvals/toolClassification'
import type {
  ConnectorRepository,
  McpServerRecord,
} from '../../storage/connectorRepository'
import type { McpClientErrorCode } from './McpClientSession'
import type { ConnectorCredential, McpServerConfig } from './mcpSchemas'
import { credentialMutationResultSchema, credentialReadResultSchema } from '../../../../shared/credentialProtocol'

import { createMcpTools } from './createMcpTools'
import { McpClientError, McpClientSession } from './McpClientSession'
import {
  connectorCredentialSchema,
  mcpServerConfigSchema,
} from './mcpSchemas'

export interface ConnectorSecretStore {
  delete: (id: string) => Promise<void>
  read: (id: string) => Promise<ConnectorCredential | null>
  write: (id: string, credential: ConnectorCredential) => Promise<void>
}

export interface BuddyConnectorEvent {
  code?: McpClientErrorCode | 'MCP_CONNECTOR_CHANGED'
  connectorId: string
  type: 'connector.tools_changed' | 'connector.unavailable'
}

export interface McpConnectorServiceOptions {
  connectors: ConnectorRepository
  invalidateSessions?: () => Promise<unknown> | unknown
  maxReconnectAttempts?: number
  notify?: (event: BuddyConnectorEvent) => void
  secrets: ConnectorSecretStore
}

export interface BuddyMcpTools {
  classifications: Map<string, BuddyToolClassification>
  diagnostics: Array<{ code: string, message: string }>
  tools: ToolDefinition[]
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
  readonly #invalidateSessions?: () => Promise<unknown> | unknown
  readonly #maxReconnectAttempts: number
  readonly #notify?: (event: BuddyConnectorEvent) => void
  readonly #secrets: ConnectorSecretStore
  readonly #pendingSessions = new Map<string, { promise: Promise<McpClientSession> }>()
  readonly #sessions = new Map<string, McpClientSession>()

  constructor(options: McpConnectorServiceOptions) {
    this.#connectors = options.connectors
    this.#invalidateSessions = options.invalidateSessions
    this.#maxReconnectAttempts = options.maxReconnectAttempts ?? 3
    this.#notify = options.notify
    this.#secrets = options.secrets
  }

  list(): readonly McpServerRecord[] {
    return this.#connectors.list()
  }

  async upsert(input: McpServerConfig): Promise<McpServerRecord> {
    const record = this.#persistConfig(input)
    await this.#connectorChanged(record.id)
    return record
  }

  async save(input: SaveMcpConnectorInput): Promise<McpServerRecord> {
    const parsed = mcpServerConfigSchema.safeParse(input.config)
    if (!parsed.success)
      throw new McpConnectorError('VALIDATION_FAILED')
    const existing = this.#connectors.findById(parsed.data.id)
    const previousRef = existing?.credentialRef ?? null

    if (
      input.credential.mode === 'keep'
      && previousRef
      && existing
      && !sameTrustTarget(existing, parsed.data)
    ) {
      throw new McpConnectorError('VALIDATION_FAILED')
    }
    if (
      input.credential.mode === 'replace'
      && !credentialMatchesTransport(input.credential.value, parsed.data.transport)
    ) {
      throw new McpConnectorError('VALIDATION_FAILED')
    }
    const previousCredential = previousRef && input.credential.mode !== 'keep'
      ? await this.#secrets.read(previousRef)
      : null

    const credentialRef = input.credential.mode === 'replace'
      ? previousRef ?? parsed.data.id
      : input.credential.mode === 'keep' ? previousRef : null
    let record: McpServerRecord
    try {
      if (input.credential.mode === 'replace')
        await this.#secrets.write(credentialRef!, input.credential.value)
      else if (input.credential.mode === 'clear' && previousRef)
        await this.#secrets.delete(previousRef)

      record = this.#persistConfig({ ...parsed.data, credentialRef })
    }
    catch (error) {
      if (input.credential.mode !== 'keep' && previousRef)
        await this.#restoreSecret(previousRef, previousCredential)
      else if (input.credential.mode === 'replace' && !previousRef)
        await this.#secrets.delete(credentialRef!)
      throw error
    }
    await this.#connectorChanged(record.id)
    return record
  }

  async trust(id: string): Promise<McpServerRecord> {
    const record = this.#requireConnector(id)
    const trustedAt = new Date().toISOString()
    if (!this.#connectors.trust(id, trustedAt))
      throw new McpConnectorError('MCP_CONNECTOR_NOT_FOUND')
    await this.#connectorChanged(id)
    return this.#requireConnector(record.id)
  }

  setEnabled(id: string, enabled: boolean): Promise<McpServerRecord> {
    const record = this.#requireConnector(id)
    return this.upsert(toConfig({ ...record, enabled }))
  }

  async saveCredential(id: string, credential: ConnectorCredential): Promise<void> {
    const record = this.#requireConnector(id)
    const parsed = connectorCredentialSchema.safeParse(credential)
    if (!parsed.success || !credentialMatchesTransport(parsed.data, record.transport))
      throw new McpConnectorError('VALIDATION_FAILED')
    const credentialRef = record.credentialRef ?? record.id
    const previous = await this.#secrets.read(credentialRef)
    await this.#secrets.write(credentialRef, parsed.data)
    try {
      this.#connectors.upsert({
        ...record,
        credentialRef,
        updatedAt: new Date().toISOString(),
      })
    }
    catch (error) {
      await this.#restoreSecret(credentialRef, previous)
      throw error
    }
    await this.#connectorChanged(id)
  }

  async clearCredential(id: string): Promise<void> {
    const record = this.#requireConnector(id)
    if (!record.credentialRef)
      return
    const previous = await this.#secrets.read(record.credentialRef)
    await this.#secrets.delete(record.credentialRef)
    try {
      this.#connectors.upsert({
        ...record,
        credentialRef: null,
        updatedAt: new Date().toISOString(),
      })
    }
    catch (error) {
      await this.#restoreSecret(record.credentialRef, previous)
      throw error
    }
    await this.#connectorChanged(id)
  }

  async remove(id: string): Promise<boolean> {
    const record = this.#connectors.findById(id)
    if (!record)
      return false
    this.#pendingSessions.delete(id)
    await this.#sessions.get(id)?.close()
    this.#sessions.delete(id)
    const previous = record.credentialRef
      ? await this.#secrets.read(record.credentialRef)
      : null
    if (record.credentialRef)
      await this.#secrets.delete(record.credentialRef)
    let removed: boolean
    try {
      removed = this.#connectors.remove(id)
    }
    catch (error) {
      if (record.credentialRef)
        await this.#restoreSecret(record.credentialRef, previous)
      throw error
    }
    if (!removed) {
      if (record.credentialRef)
        await this.#restoreSecret(record.credentialRef, previous)
      return false
    }
    await this.#invalidateSessions?.()
    this.#notify?.({
      code: 'MCP_CONNECTOR_CHANGED',
      connectorId: id,
      type: 'connector.tools_changed',
    })
    return removed
  }

  async getTools(signal?: AbortSignal): Promise<BuddyMcpTools> {
    const classifications = new Map<string, BuddyToolClassification>()
    const diagnostics: BuddyMcpTools['diagnostics'] = []
    const tools: ToolDefinition[] = []
    const toolNames = new Set<string>()

    for (const connector of this.#connectors.list().filter(record => record.enabled)) {
      try {
        const session = await this.#getSession(connector)
        const result = createMcpTools({
          serverId: connector.id,
          serverName: connector.name,
          session,
          tools: await session.listTools(signal),
          trusted: connector.trustedAt !== null,
        })
        diagnostics.push(...result.diagnostics)
        for (const tool of result.tools) {
          if (toolNames.has(tool.name)) {
            diagnostics.push({
              code: 'MCP_TOOL_INVALID',
              message: 'A Lexora Buddy connector tool has invalid or conflicting metadata',
            })
            continue
          }
          toolNames.add(tool.name)
          tools.push(tool)
          const classification = result.classifications.get(tool.name)
          if (classification)
            classifications.set(tool.name, classification)
        }
      }
      catch (error) {
        const code = error instanceof McpClientError ? error.code : 'MCP_SERVER_UNAVAILABLE'
        diagnostics.push({
          code,
          message: 'A Lexora Buddy connector is unavailable',
        })
        this.#notify?.({ code, connectorId: connector.id, type: 'connector.unavailable' })
      }
    }
    return { classifications, diagnostics, tools }
  }

  async close(): Promise<void> {
    const pending = [...this.#pendingSessions.values()].map(item => item.promise)
    this.#pendingSessions.clear()
    await Promise.allSettled([
      ...[...this.#sessions.values()].map(session => session.close()),
      ...pending,
    ])
    this.#sessions.clear()
  }

  async #getSession(record: McpServerRecord): Promise<McpClientSession> {
    const existing = this.#sessions.get(record.id)
    if (existing)
      return existing
    const inFlight = this.#pendingSessions.get(record.id)
    if (inFlight)
      return inFlight.promise
    const pending = {} as { promise: Promise<McpClientSession> }
    pending.promise = this.#createSession(record).then(async (session) => {
      if (this.#pendingSessions.get(record.id) === pending) {
        this.#pendingSessions.delete(record.id)
        this.#sessions.set(record.id, session)
        return session
      }
      const replacement = this.#sessions.get(record.id)
      await session.close()
      if (replacement)
        return replacement
      throw new McpConnectorError('MCP_CONNECTOR_CHANGED')
    }, (error) => {
      if (this.#pendingSessions.get(record.id) === pending)
        this.#pendingSessions.delete(record.id)
      throw error
    })
    this.#pendingSessions.set(record.id, pending)
    return pending.promise
  }

  async #createSession(record: McpServerRecord): Promise<McpClientSession> {
    const config = toConfig(record)
    const credential = record.credentialRef
      ? await this.#secrets.read(record.credentialRef)
      : null
    if (credential && !credentialMatchesTransport(credential, record.transport))
      throw new McpConnectorError('VALIDATION_FAILED')
    return new McpClientSession({
      config,
      credential,
      maxReconnectAttempts: this.#maxReconnectAttempts,
      onUnavailable: code => this.#notify?.({
        code,
        connectorId: record.id,
        type: 'connector.unavailable',
      }),
    })
  }

  async #connectorChanged(id: string): Promise<void> {
    this.#pendingSessions.delete(id)
    await this.#sessions.get(id)?.close()
    this.#sessions.delete(id)
    await this.#invalidateSessions?.()
    this.#notify?.({
      code: 'MCP_CONNECTOR_CHANGED',
      connectorId: id,
      type: 'connector.tools_changed',
    })
  }

  #persistConfig(input: McpServerConfig): McpServerRecord {
    const parsed = mcpServerConfigSchema.safeParse(input)
    if (!parsed.success)
      throw new McpConnectorError('VALIDATION_FAILED')
    const existing = this.#connectors.findById(parsed.data.id)
    const trustedAt = existing && sameTrustTarget(existing, parsed.data)
      ? existing.trustedAt
      : null
    if (parsed.data.transport === 'stdio' && parsed.data.enabled && !trustedAt)
      throw new McpConnectorError('MCP_CONNECTOR_TRUST_REQUIRED')
    const now = new Date().toISOString()
    return this.#connectors.upsert(toRecord(
      parsed.data,
      existing?.createdAt ?? now,
      now,
      trustedAt,
    ))
  }

  async #restoreSecret(
    id: string,
    credential: ConnectorCredential | null,
  ): Promise<void> {
    if (credential) {
      await this.#secrets.write(id, credential)
      return
    }
    await this.#secrets.delete(id)
  }

  #requireConnector(id: string): McpServerRecord {
    const record = this.#connectors.findById(id)
    if (!record)
      throw new McpConnectorError('MCP_CONNECTOR_NOT_FOUND')
    return record
  }
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
  return transport === 'stdio' ? credential.type === 'stdio' : credential.type === 'http'
}
