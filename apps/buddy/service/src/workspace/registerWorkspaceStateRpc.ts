import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { WorkspaceRepository } from '../storage/workspaceRepository'
import { z } from 'zod'
import { BuddyServiceError, parse } from '../rpc/runtimeRequest'

const WORKSPACE_STATE_KEY = 'buddy.chat.workspace.v1'
const workspaceStateKeySchema = z.literal(WORKSPACE_STATE_KEY)

export interface RegisterWorkspaceStateRpcOptions {
  repository: Pick<WorkspaceRepository, 'getRecord' | 'set'>
  rpc: RuntimeRequestRegistrar
}

export function registerWorkspaceStateRpc(
  options: RegisterWorkspaceStateRpcOptions,
): () => void {
  const disposers = [
    options.rpc.onRequest('workspaceState.read', (params) => {
      const input = parse(z.object({ key: workspaceStateKeySchema }).strict(), params)
      return options.repository.getRecord(input.key)
    }),
    options.rpc.onRequest('workspaceState.write', (params) => {
      const input = parse(z.object({
        key: workspaceStateKeySchema,
        value: z.unknown(),
      }).strict(), params)
      options.repository.set(input.key, input.value, new Date().toISOString())
      const record = options.repository.getRecord(input.key)
      if (!record)
        throw new BuddyServiceError('VALIDATION_FAILED')
      return record
    }),
  ]
  return () => disposers.splice(0).forEach(dispose => dispose())
}
