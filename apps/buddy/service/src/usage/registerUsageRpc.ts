import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { UsageRepository } from '../storage/usageRepository'
import { z } from 'zod'
import { parse } from '../rpc/runtimeRequest'
import { toPublicUsage } from './publicUsage'

const emptySchema = z.object({}).strict()

export interface RegisterUsageRpcOptions {
  repository: Pick<UsageRepository, 'listRecent' | 'summarize'>
  rpc: RuntimeRequestRegistrar
}

export function registerUsageRpc(options: RegisterUsageRpcOptions): () => void {
  return options.rpc.onRequest('usage.snapshot', (params) => {
    parse(emptySchema, params)
    return {
      records: options.repository.listRecent(500).map(toPublicUsage),
      totals: options.repository.summarize(),
    }
  })
}
