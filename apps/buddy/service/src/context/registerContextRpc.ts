import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { ContextUsageSnapshotReader } from './ContextUsageSnapshotService'
import { contextRpc } from '../../../shared/conversation/contextApi'

import { registerRuntimeRequest } from '../rpc/runtimeRequest'

export interface RegisterContextRpcOptions {
  rpc: RuntimeRequestRegistrar
  service: ContextUsageSnapshotReader
}

export function registerContextRpc(options: RegisterContextRpcOptions): () => void {
  return registerRuntimeRequest(options.rpc, contextRpc.usageSnapshot, params => (
    options.service.getSnapshot(params)
  ))
}
