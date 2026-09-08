import type { ArtifactService } from '../artifacts/ArtifactService'
import type { DirectoryGrant } from '../directories/resolveGrantedPath'
import type { ArtifactRecord } from '../storage/artifactRepository'
import type { ChromaOptions } from './runChromaTransform'
import { ImageTransformError } from './ImageTransformError'
import { runChromaTransform } from './runChromaTransform'

export interface RemoveChromaInput extends ChromaOptions {
  conversationId: string
  cwd: string
  grants: readonly DirectoryGrant[]
  outputPath: string
  sourceArtifactId: string
}

export class ImageTransformService {
  readonly #artifacts: Pick<ArtifactService, 'materializeConversationArtifact' | 'registerGeneratedImages'>

  constructor(options: {
    artifacts: Pick<ArtifactService, 'materializeConversationArtifact' | 'registerGeneratedImages'>
  }) {
    this.#artifacts = options.artifacts
  }

  async removeChroma(input: RemoveChromaInput, signal?: AbortSignal): Promise<ArtifactRecord> {
    signal?.throwIfAborted()
    if (!input.outputPath.trim())
      throw new ImageTransformError('VALIDATION_FAILED')
    const source = await this.#artifacts.materializeConversationArtifact(input.conversationId, input.sourceArtifactId)
    signal?.throwIfAborted()
    if (source.resource.mimeType !== 'image/png')
      throw new ImageTransformError('IMAGE_TRANSFORM_UNSUPPORTED_FORMAT')
    const bytes = await runChromaTransform(source.bytes, {
      color: input.color,
      despill: input.despill,
      softness: input.softness,
      tolerance: input.tolerance,
    }, signal)
    signal?.throwIfAborted()
    const [artifact] = await this.#artifacts.registerGeneratedImages({
      conversationId: input.conversationId,
      cwd: input.cwd,
      grants: input.grants,
      images: [{ bytes, mimeType: 'image/png' }],
      outputPath: input.outputPath,
      sourceArtifactId: input.sourceArtifactId,
    })
    if (!artifact)
      throw new ImageTransformError('IMAGE_TRANSFORM_FAILED')
    return artifact
  }
}
