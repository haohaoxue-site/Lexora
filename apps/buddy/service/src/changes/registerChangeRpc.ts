import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { ChangeCaptureService } from './ChangeCaptureService'
import { z } from 'zod'
import { BuddyServiceError, parse } from '../rpc/runtimeRequest'
import { ChangeCaptureError } from './ChangeCaptureService'

const idSchema = z.string().trim().min(1).max(256)

export function registerChangeRpc(options: {
  rpc: RuntimeRequestRegistrar
  service: Pick<ChangeCaptureService, 'getVisibleDetail'>
}): () => void {
  return options.rpc.onRequest('changes.get', async (params) => {
    const input = parse(z.object({ changeSetId: idSchema }).strict(), params)
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
