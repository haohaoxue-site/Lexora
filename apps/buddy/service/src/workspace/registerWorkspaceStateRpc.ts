import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { WorkspaceRepository } from '../storage/workspaceRepository'
import { workspaceStateRpc } from '../../../shared/conversation/workspaceApi'
import { BuddyServiceError, registerRuntimeRequest } from '../rpc/runtimeRequest'

export interface RegisterWorkspaceStateRpcOptions {
  normalize?: (value: unknown) => Promise<unknown>
  repository: Pick<WorkspaceRepository, 'getRecord' | 'set'>
  rpc: RuntimeRequestRegistrar
}

export function registerWorkspaceStateRpc(
  options: RegisterWorkspaceStateRpcOptions,
): () => void {
  const disposers = [
    registerRuntimeRequest(options.rpc, workspaceStateRpc.read, async (input) => {
      const record = options.repository.getRecord(input.key)
      return record && options.normalize ? { ...record, value: await options.normalize(record.value) } : record
    }),
    registerRuntimeRequest(options.rpc, workspaceStateRpc.write, (input) => {
      options.repository.set(input.key, input.value, new Date().toISOString())
      const record = options.repository.getRecord(input.key)
      if (!record)
        throw new BuddyServiceError('VALIDATION_FAILED')
      return record
    }),
  ]
  return () => disposers.splice(0).forEach(dispose => dispose())
}
