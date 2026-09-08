import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { UsageRepository } from '../storage/usageRepository'
import { usageRpc } from '../../../shared/usage/usageApi'
import { registerRuntimeRequest } from '../rpc/runtimeRequest'
import { toPublicUsage } from './publicUsage'

export interface RegisterUsageRpcOptions {
  repository: Pick<UsageRepository, 'listRecent' | 'summarize'>
  rpc: RuntimeRequestRegistrar
}

export function registerUsageRpc(options: RegisterUsageRpcOptions): () => void {
  return registerRuntimeRequest(options.rpc, usageRpc.snapshot, () => {
    return {
      records: options.repository.listRecent(500).map(toPublicUsage),
      totals: options.repository.summarize(),
    }
  })
}
