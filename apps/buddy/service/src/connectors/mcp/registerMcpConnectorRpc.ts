import type { RuntimeRequestRegistrar } from '../../rpc/runtimeRequest'
import type { McpServerRecord } from '../../storage/connectorRepository'
import type { McpConnectorService } from './McpConnectorService'
import { connectorsRpc } from '../../../../shared/connectors/connectorApi'
import { ok, registerRuntimeRequest } from '../../rpc/runtimeRequest'

export function registerMcpConnectorRpc(
  rpc: RuntimeRequestRegistrar,
  service: McpConnectorService,
): () => void {
  const disposers: Array<() => void> = []

  disposers.push(registerRuntimeRequest(rpc, connectorsRpc.list, () => {
    return service.list().map(toPublicConnector)
  }))
  disposers.push(registerRuntimeRequest(rpc, connectorsRpc.upsert, async (input) => {
    await service.save({
      config: { ...input.config, credentialRef: null },
      credential: input.credential,
    })
    return service.list().map(toPublicConnector)
  }))
  disposers.push(registerRuntimeRequest(rpc, connectorsRpc.remove, async (input) => {
    await service.remove(input.connectorId)
    return ok()
  }))
  disposers.push(registerRuntimeRequest(rpc, connectorsRpc.trust, async (input) => {
    await service.trust(input.connectorId)
    return ok()
  }))
  disposers.push(registerRuntimeRequest(rpc, connectorsRpc.saveCredential, async (input) => {
    await service.saveCredential(input.connectorId, input.credential)
    return ok()
  }))
  disposers.push(registerRuntimeRequest(rpc, connectorsRpc.clearCredential, async (input) => {
    await service.clearCredential(input.connectorId)
    return ok()
  }))

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
