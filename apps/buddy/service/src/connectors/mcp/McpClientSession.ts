import type { ConnectorCredential, McpServerConfig } from './mcpSchemas'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const MAX_TOOL_PAGES = 20

export interface McpRemoteTool {
  annotations?: {
    destructiveHint?: boolean
    openWorldHint?: boolean
    readOnlyHint?: boolean
  }
  description?: string
  inputSchema: Record<string, unknown> & { type: 'object' }
  name: string
}

export interface McpClientSessionOptions {
  config: McpServerConfig
  credential: ConnectorCredential | null
  maxReconnectAttempts?: number
  onUnavailable?: (code: McpClientErrorCode) => void
}

export type McpClientErrorCode
  = 'MCP_RECONNECT_LIMIT_REACHED'
    | 'MCP_SERVER_DISCONNECTED'
    | 'MCP_SERVER_UNAVAILABLE'
    | 'MCP_TOOL_FAILED'

export class McpClientSession {
  readonly #config: McpServerConfig
  readonly #credential: ConnectorCredential | null
  readonly #maxReconnectAttempts: number
  readonly #onUnavailable?: (code: McpClientErrorCode) => void
  #client: Client | null = null
  #closing = false
  #connectPromise: Promise<void> | null = null
  #consecutiveFailures = 0
  #connected = false

  constructor(options: McpClientSessionOptions) {
    this.#config = options.config
    this.#credential = options.credential
    this.#maxReconnectAttempts = options.maxReconnectAttempts ?? 3
    this.#onUnavailable = options.onUnavailable
  }

  async connect(): Promise<void> {
    if (this.#connected)
      return
    if (this.#connectPromise)
      return this.#connectPromise
    if (this.#closing)
      throw new McpClientError('MCP_SERVER_UNAVAILABLE')
    if (this.#consecutiveFailures >= this.#maxReconnectAttempts)
      throw new McpClientError('MCP_RECONNECT_LIMIT_REACHED')

    const operation = this.#connect()
    this.#connectPromise = operation
    try {
      await operation
    }
    finally {
      if (this.#connectPromise === operation)
        this.#connectPromise = null
    }
  }

  async #connect(): Promise<void> {
    const client = new Client({
      name: 'lexora-buddy',
      version: '0.1.0',
    })
    client.onclose = () => {
      if (this.#client !== client)
        return
      this.#client = null
      this.#connected = false
      if (!this.#closing)
        this.#onUnavailable?.('MCP_SERVER_DISCONNECTED')
    }
    client.onerror = () => {
      if (this.#client === client && !this.#closing)
        this.#onUnavailable?.('MCP_SERVER_UNAVAILABLE')
    }

    this.#client = client
    try {
      await client.connect(createTransport(this.#config, this.#credential), { timeout: 10_000 })
      if (this.#closing || this.#client !== client)
        throw new McpClientError('MCP_SERVER_UNAVAILABLE')
      this.#connected = true
      this.#consecutiveFailures = 0
    }
    catch (error) {
      this.#consecutiveFailures += 1
      if (this.#client === client)
        this.#client = null
      await client.close().catch(() => {})
      throw new McpClientError(
        this.#consecutiveFailures >= this.#maxReconnectAttempts
          ? 'MCP_RECONNECT_LIMIT_REACHED'
          : 'MCP_SERVER_UNAVAILABLE',
        { cause: error },
      )
    }
  }

  async listTools(signal?: AbortSignal): Promise<McpRemoteTool[]> {
    await this.connect()
    const client = this.#requireClient()
    const tools: McpRemoteTool[] = []
    let cursor: string | undefined
    const seenCursors = new Set<string>()
    for (let page = 0; page < MAX_TOOL_PAGES; page += 1) {
      signal?.throwIfAborted()
      const result = await client.listTools(cursor ? { cursor } : undefined, {
        signal,
        timeout: 15_000,
      })
      tools.push(...result.tools.map(tool => ({
        annotations: tool.annotations,
        description: tool.description,
        inputSchema: tool.inputSchema,
        name: tool.name,
      })))
      if (!result.nextCursor)
        return tools
      if (seenCursors.has(result.nextCursor))
        throw new McpClientError('MCP_SERVER_UNAVAILABLE')
      seenCursors.add(result.nextCursor)
      cursor = result.nextCursor
    }
    throw new McpClientError('MCP_SERVER_UNAVAILABLE')
  }

  async callTool(name: string, arguments_: unknown, signal?: AbortSignal): Promise<unknown> {
    await this.connect()
    try {
      return await this.#requireClient().callTool({
        arguments: isRecord(arguments_) ? arguments_ : {},
        name,
      }, undefined, {
        signal,
        timeout: 60_000,
      })
    }
    catch (error) {
      if (signal?.aborted)
        throw error
      throw new McpClientError('MCP_TOOL_FAILED', { cause: error })
    }
  }

  async close(): Promise<void> {
    this.#closing = true
    this.#connected = false
    const client = this.#client
    this.#client = null
    await client?.close().catch(() => {})
    await this.#connectPromise?.catch(() => {})
  }

  #requireClient(): Client {
    if (!this.#client || !this.#connected)
      throw new McpClientError('MCP_SERVER_UNAVAILABLE')
    return this.#client
  }
}

export class McpClientError extends Error {
  readonly code: McpClientErrorCode

  constructor(code: McpClientErrorCode, options?: ErrorOptions) {
    super('Lexora Buddy connector is unavailable', options)
    this.name = 'McpClientError'
    this.code = code
  }
}

function createTransport(config: McpServerConfig, credential: ConnectorCredential | null) {
  if (config.transport === 'stdio') {
    const secretEnvironment = credential?.type === 'stdio' ? credential.env : {}
    return new StdioClientTransport({
      args: config.args,
      command: config.command,
      cwd: config.cwd ?? undefined,
      env: { ...getDefaultEnvironment(), ...secretEnvironment },
      stderr: 'pipe',
    })
  }

  const headers = new Headers(credential?.type === 'http' ? credential.headers : undefined)
  if (credential?.type === 'http' && credential.bearerToken)
    headers.set('authorization', `Bearer ${credential.bearerToken}`)
  return new StreamableHTTPClientTransport(new URL(config.url), {
    reconnectionOptions: {
      initialReconnectionDelay: 500,
      maxReconnectionDelay: 5_000,
      maxRetries: 2,
      reconnectionDelayGrowFactor: 2,
    },
    requestInit: { headers },
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
