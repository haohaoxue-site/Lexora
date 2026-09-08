import type { AutomationChangeCoordinator } from '../automations/AutomationChangeCoordinator'
import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { SpaceRepository } from '../storage/spaceRepository'
import type { SpaceService } from './SpaceService'
import { spacesRpc } from '../../../shared/spaces/spaceApi'
import { ok, registerRuntimeRequest } from '../rpc/runtimeRequest'
import { requireActiveSpace } from './requireActiveSpace'

export interface SpaceSessionInvalidator {
  invalidateSpace: (spaceId: string) => Promise<unknown>
}

export interface RegisterSpaceRpcOptions {
  automations: Pick<AutomationChangeCoordinator, 'blockSpace'>
  rpc: RuntimeRequestRegistrar
  service: SpaceService
  sessions: SpaceSessionInvalidator
  spaces: Pick<SpaceRepository, 'findById'>
}

export function registerSpaceRpc(options: RegisterSpaceRpcOptions): () => void {
  const disposers: Array<() => void> = []

  disposers.push(registerRuntimeRequest(options.rpc, spacesRpc.create, (params) => {
    return options.service.create(params)
  }))
  disposers.push(registerRuntimeRequest(options.rpc, spacesRpc.update, async (input) => {
    requireActiveSpace(options.spaces.findById(input.spaceId))
    const updated = await options.service.update(input)
    await options.sessions.invalidateSpace(input.spaceId)
    return updated
  }))
  disposers.push(registerRuntimeRequest(options.rpc, spacesRpc.delete, async (input) => {
    requireActiveSpace(options.spaces.findById(input.spaceId))
    await options.service.delete(input.spaceId)
    options.automations.blockSpace(input.spaceId)
    await options.sessions.invalidateSpace(input.spaceId)
    return ok()
  }))
  disposers.push(registerRuntimeRequest(options.rpc, spacesRpc.list, (input) => {
    return options.service.list().slice(0, input.limit ?? 100)
  }))
  disposers.push(registerRuntimeRequest(options.rpc, spacesRpc.searchFiles, (input) => {
    return options.service.searchFiles(input.spaceId, input.query)
  }))

  return () => disposers.splice(0).forEach(dispose => dispose())
}
