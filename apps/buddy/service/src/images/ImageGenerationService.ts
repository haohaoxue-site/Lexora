import type { Api, ImageContent, Model } from '@earendil-works/pi-ai'
import type { DirectoryGrant } from '../directories/resolveGrantedPath'
import type { ImageGenerationGateway } from './ImageGenerationGateway'
import { ImageGenerationError } from './ImageGenerationGateway'

export interface GenerateConversationImageInput {
  outputPath: string
  prompt: string
  reference?: { mode: 'latest' } | { mode: 'resources', resourceIds: readonly string[] }
}

interface ConversationImageSource {
  materializeConversationImages: (
    conversationId: string,
    ids?: readonly string[],
  ) => Promise<{ images: ImageContent[], records: Array<{ id: string }> }>
}

export interface ImageGenerationServiceOptions {
  artifactService: ConversationImageSource & {
    registerGeneratedImages: (input: {
      conversationId: string
      cwd: string
      grants: readonly DirectoryGrant[]
      images: readonly { bytes: Uint8Array, mimeType: string }[]
      outputPath: string
      sourceArtifactId: string | null
    }) => Promise<Array<{ id: string }>>
  }
  attachmentService: ConversationImageSource
  conversationId: string
  cwd: string
  grants: readonly DirectoryGrant[]
  imageGenerationGateway: ImageGenerationGateway
}

export class ImageGenerationService {
  readonly #options: ImageGenerationServiceOptions

  constructor(options: ImageGenerationServiceOptions) {
    this.#options = options
  }

  supports(model: Model<Api>): boolean {
    return this.#options.imageGenerationGateway.supports(model)
  }

  async generate(input: GenerateConversationImageInput, model: Model<Api>, signal: AbortSignal) {
    signal.throwIfAborted()
    if (!this.supports(model))
      throw new ImageGenerationError('IMAGE_GENERATION_UNSUPPORTED')
    const references = input.reference
      ? await this.#materializeReferences(input.reference)
      : { artifactIds: [], images: [] }
    signal.throwIfAborted()
    const generated = await this.#options.imageGenerationGateway.generate({
      inputImages: references.images,
      model,
      prompt: input.prompt.trim(),
      signal,
    })
    signal.throwIfAborted()
    const artifacts = await this.#options.artifactService.registerGeneratedImages({
      conversationId: this.#options.conversationId,
      cwd: this.#options.cwd,
      grants: this.#options.grants,
      images: generated.images,
      outputPath: input.outputPath.trim(),
      sourceArtifactId: references.artifactIds.at(-1) ?? null,
    })
    return {
      artifactIds: artifacts.map(artifact => artifact.id),
      responseId: generated.responseId,
    }
  }

  async #materializeReferences(
    reference: NonNullable<GenerateConversationImageInput['reference']>,
  ): Promise<{ artifactIds: string[], images: ImageContent[] }> {
    const { artifactService, attachmentService, conversationId } = this.#options
    if (reference.mode === 'latest') {
      const artifacts = await artifactService.materializeConversationImages(conversationId)
      if (artifacts.images.length > 0) {
        return {
          artifactIds: artifacts.records.map(record => record.id),
          images: artifacts.images,
        }
      }
      const attachments = await attachmentService.materializeConversationImages(conversationId)
      return { artifactIds: [], images: attachments.images }
    }

    const artifactIds: string[] = []
    const images: ImageContent[] = []
    for (const resourceId of reference.resourceIds) {
      try {
        const artifacts = await artifactService.materializeConversationImages(conversationId, [resourceId])
        artifactIds.push(resourceId)
        images.push(...artifacts.images)
      }
      catch (error) {
        if ((error as { code?: unknown }).code !== 'ARTIFACT_NOT_FOUND')
          throw error
        const attachments = await attachmentService.materializeConversationImages(conversationId, [resourceId])
        images.push(...attachments.images)
      }
    }
    return { artifactIds, images }
  }
}
