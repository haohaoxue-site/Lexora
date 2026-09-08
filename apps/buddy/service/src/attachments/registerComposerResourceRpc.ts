import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { ComposerResourceService } from './ComposerResourceService'
import { composerResourcesRpc } from '../../../shared/conversation/composerApi'

import { registerRuntimeRequest } from '../rpc/runtimeRequest'

export function registerComposerResourceRpc(options: {
  rpc: RuntimeRequestRegistrar
  service: ComposerResourceService
}): () => void {
  const disposers = [
    registerRuntimeRequest(options.rpc, composerResourcesRpc.listSources, params => options.service.listSources(
      params,
    )),
    registerRuntimeRequest(options.rpc, composerResourcesRpc.selectSource, (params) => {
      const { referencedResourceIds, ...input } = params
      return options.service.selectSource(input, referencedResourceIds)
    }),
    registerRuntimeRequest(options.rpc, composerResourcesRpc.selectSpaceFile, (params) => {
      const { referencedResourceIds, ...input } = params
      return options.service.selectSpaceFile(input, referencedResourceIds)
    }),
    registerRuntimeRequest(options.rpc, composerResourcesRpc.accept, params => options.service.accept(
      params,
    )),
    registerRuntimeRequest(options.rpc, composerResourcesRpc.complete, params => options.service.complete(
      params,
    )),
    registerRuntimeRequest(options.rpc, composerResourcesRpc.fail, params => options.service.fail(
      params,
    )),
    registerRuntimeRequest(options.rpc, composerResourcesRpc.retry, params => options.service.retry(
      params,
    )),
    registerRuntimeRequest(options.rpc, composerResourcesRpc.list, (params) => {
      const { draftId } = params
      return options.service.list(draftId)
    }),
    registerRuntimeRequest(options.rpc, composerResourcesRpc.registerFiles, (params) => {
      const { draftId, paths, referencedResourceIds } = params
      return options.service.registerFiles({ draftId, paths, referencedResourceIds })
    }),
  ]
  return () => disposers.splice(0).forEach(dispose => dispose())
}
