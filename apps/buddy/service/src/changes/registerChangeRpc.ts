import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { ChangeCaptureService } from './ChangeCaptureService'
import { changesRpc } from '../../../shared/changes/changeApi'
import { BuddyServiceError, registerRuntimeRequest } from '../rpc/runtimeRequest'
import { ChangeCaptureError } from './ChangeCaptureService'

export function registerChangeRpc(options: {
  rpc: RuntimeRequestRegistrar
  service: Pick<ChangeCaptureService, 'getVisibleDetail'>
}): () => void {
  return registerRuntimeRequest(options.rpc, changesRpc.get, async (input) => {
    try {
      return await options.service.getVisibleDetail(input.changeSetId)
    }
    catch (error) {
      if (error instanceof ChangeCaptureError)
        throw new BuddyServiceError('VALIDATION_FAILED')
      throw error
    }
  })
}
