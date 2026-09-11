import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { UsageAnalyticsRepository } from '../storage/usageAnalyticsRepository'
import type { UsageRepository } from '../storage/usageRepository'
import { usageAnalyticsRpc } from '../../../shared/usage/usageAnalyticsApi'
import { usageRpc } from '../../../shared/usage/usageApi'
import { registerRuntimeRequest } from '../rpc/runtimeRequest'
import { toPublicUsage } from './publicUsage'

export interface RegisterUsageRpcOptions {
  repository: Pick<UsageRepository, 'listRecent' | 'summarize'>
  analytics: UsageAnalyticsRepository
  rpc: RuntimeRequestRegistrar
}

export function registerUsageRpc(options: RegisterUsageRpcOptions): () => void {
  const stops = [
    registerRuntimeRequest(options.rpc, usageRpc.snapshot, () => ({
      records: options.repository.listRecent(500).map(toPublicUsage),
      totals: options.repository.summarize(),
    })),
    registerRuntimeRequest(options.rpc, usageAnalyticsRpc.analytics, input => options.analytics.analytics(input)),
    registerRuntimeRequest(options.rpc, usageAnalyticsRpc.topTasks, input => options.analytics.topTasks(input)),
    registerRuntimeRequest(options.rpc, usageAnalyticsRpc.trend, input => options.analytics.trend(input)),
  ]
  return () => stops.forEach(stop => stop())
}
