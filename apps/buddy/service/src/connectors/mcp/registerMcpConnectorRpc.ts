import type { RuntimeRequestRegistrar } from '../../rpc/runtimeRequest'
import type { McpServerRecord } from '../../storage/connectorRepository'
import type { McpConnectorService } from './McpConnectorService'
import { z } from 'zod'

import { ok, parse } from '../../rpc/runtimeRequest'
import { connectorCredentialSchema } from './mcpSchemas'

const connectorConfigIdSchema = z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)
const connectorIdSchema = z.string().trim().min(1).max(256)
const connectorConfigSchema = z.discriminatedUnion('transport', [
  z.object({
    args: z.array(z.string().max(4096)).max(128),
    command: z.string().trim().min(1).max(4096),
    cwd: z.string().nullable(),
    enabled: z.boolean(),
    id: connectorConfigIdSchema,
    name: z.string().trim().min(1).max(128),
    transport: z.literal('stdio'),
  }).strict(),
  z.object({
    enabled: z.boolean(),
    id: connectorConfigIdSchema,
    name: z.string().trim().min(1).max(128),
    transport: z.literal('streamable-http'),
    url: z.url(),
  }).strict(),
])
const connectorCredentialMutationSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('keep') }).strict(),
  z.object({ mode: z.literal('clear') }).strict(),
  z.object({ mode: z.literal('replace'), value: connectorCredentialSchema }).strict(),
])
const connectorCredentialRequestSchema = z.object({
  connectorId: connectorIdSchema,
  credential: connectorCredentialSchema,
}).strict()
const connectorIdRequestSchema = z.object({ connectorId: connectorIdSchema }).strict()
const connectorUpsertRequestSchema = z.object({
  config: connectorConfigSchema,
  credential: connectorCredentialMutationSchema,
}).strict()
const emptySchema = z.object({}).strict()

export function registerMcpConnectorRpc(
  rpc: RuntimeRequestRegistrar,
  service: McpConnectorService,
): () => void {
  const disposers: Array<() => void> = []
  const on = (method: string, handler: (params: unknown) => Promise<unknown> | unknown) => {
    disposers.push(rpc.onRequest(method, handler))
  }

  on('connectors.list', (params) => {
    parse(emptySchema, params)
    return service.list().map(toPublicConnector)
  })
  on('connectors.upsert', async (params) => {
    const input = parse(connectorUpsertRequestSchema, params)
    await service.save({
      config: { ...input.config, credentialRef: null },
      credential: input.credential,
    })
    return service.list().map(toPublicConnector)
  })
  on('connectors.remove', async (params) => {
    const input = parse(connectorIdRequestSchema, params)
    await service.remove(input.connectorId)
    return ok()
  })
  on('connectors.trust', async (params) => {
    const input = parse(connectorIdRequestSchema, params)
    await service.trust(input.connectorId)
    return ok()
  })
  on('connectors.saveCredential', async (params) => {
    const input = parse(connectorCredentialRequestSchema, params)
    await service.saveCredential(input.connectorId, input.credential)
    return ok()
  })
  on('connectors.clearCredential', async (params) => {
    const input = parse(connectorIdRequestSchema, params)
    await service.clearCredential(input.connectorId)
    return ok()
  })

  return () => disposers.splice(0).forEach(dispose => dispose())
}

function toPublicConnector(record: McpServerRecord) {
  const common = {
    credentialConfigured: record.credentialRef !== null,
    enabled: record.enabled,
    id: record.id,
    name: record.name,
    trusted: record.trustedAt !== null,
  }
  if (record.transport === 'stdio') {
    return {
      ...common,
      args: record.args ?? [],
      command: record.command ?? '',
      cwd: record.cwd,
      transport: record.transport,
    }
  }
  return { ...common, transport: record.transport, url: record.url ?? '' }
}
