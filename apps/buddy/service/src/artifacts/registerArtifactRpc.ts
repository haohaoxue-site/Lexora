import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { ArtifactService } from './ArtifactService'
import { z } from 'zod'
import { parse } from '../rpc/runtimeRequest'

const idSchema = z.string().trim().min(1).max(256)

export interface RegisterArtifactRpcOptions {
  rpc: RuntimeRequestRegistrar
  service: Pick<ArtifactService, 'resolvePreview'>
}

export function registerArtifactRpc(options: RegisterArtifactRpcOptions): () => void {
  return options.rpc.onRequest('artifacts.resolvePreview', (params) => {
    const input = parse(z.object({ artifactId: idSchema }).strict(), params)
    return options.service.resolvePreview(input.artifactId)
  })
}
