import type { RuntimeRpcPeerContract } from '../../../shared/runtime/rpcPeer'
import type { NativePetSupervisor } from './NativePetSupervisor'

import {
  petExecuteSequenceParamsSchema,
  petExecuteSequenceResultSchema,
} from '../../../shared/runtime/petProtocol'

export function registerPetHostRpc(
  peer: RuntimeRpcPeerContract,
  supervisor: Pick<NativePetSupervisor, 'executeSequence'>,
): () => void {
  return peer.onRequest('host.pet.executeSequence', async (params) => {
    const parsed = petExecuteSequenceParamsSchema.safeParse(params)
    if (!parsed.success) {
      return petExecuteSequenceResultSchema.parse({
        code: 'VALIDATION_FAILED',
        completedSteps: 0,
        status: 'failed',
      })
    }
    try {
      return petExecuteSequenceResultSchema.parse(await supervisor.executeSequence(parsed.data))
    }
    catch {
      return petExecuteSequenceResultSchema.parse({
        code: 'PET_UNAVAILABLE',
        completedSteps: 0,
        status: 'failed',
      })
    }
  })
}
