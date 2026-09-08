import type { ConnectorCredential } from '../../../../shared/connectors/connectorCredentials'
import type { McpServerConfig } from './mcpSchemas'
import process from 'node:process'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createChildProcessEnvironment } from '../../../../platform/process/childProcessEnvironment'

export function createMcpTransport(config: McpServerConfig, credential: ConnectorCredential | null) {
  if (config.transport === 'stdio') {
    return new McpStdioTransport({
      args: config.args,
      command: config.command,
      cwd: config.cwd ?? undefined,
      env: createChildProcessEnvironment({
        source: process.env,
        additions: credential?.type === 'stdio' ? credential.env : {},
      }),
      stderr: 'ignore',
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

class McpStdioTransport extends StdioClientTransport {
  #closePromise: Promise<void> | null = null

  override close(): Promise<void> {
    return this.#closePromise ??= super.close()
  }
}
