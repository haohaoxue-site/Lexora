import type { ImageContent } from '@earendil-works/pi-ai'
import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import type { Static, TSchema } from 'typebox'
import type { DirectoryGrant } from '../../directories/resolveGrantedPath'
import type {
  ImageGenerationErrorCode,
  ImageGenerationErrorDiagnostic,
  ImageGenerationGateway,
} from '../../images/ImageGenerationGateway'
import type { ImageGenerationToolDetails } from '../../images/imageGenerationToolContract'
import type { BuddyInProcessExtension } from '../createBuddyResourceLoader'
import { defineTool } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import { Check } from 'typebox/value'
import {
  readImageGenerationError,
} from '../../images/ImageGenerationGateway'
import {
  IMAGE_GENERATION_TOOL_NAME,
  readImageGenerationToolDetails,
} from '../../images/imageGenerationToolContract'

export { IMAGE_GENERATION_TOOL_NAME } from '../../images/imageGenerationToolContract'

const imageGenerationParameters = Type.Object({
  outputPath: Type.String({
    description: 'Output file path in the current workspace. The image extension is optional.',
    maxLength: 4096,
    minLength: 1,
    pattern: '\\S',
  }),
  prompt: Type.String({ maxLength: 32 * 1024, minLength: 1, pattern: '\\S' }),
  reference: Type.Optional(Type.Union([
    Type.Object({
      mode: Type.Literal('latest'),
    }, { additionalProperties: false }),
    Type.Object({
      resourceIds: Type.Array(Type.String({ maxLength: 256, minLength: 1 }), {
        maxItems: 4,
        minItems: 1,
        uniqueItems: true,
      }),
      mode: Type.Literal('resources'),
    }, { additionalProperties: false }),
  ])),
}, { additionalProperties: false })

type ImageGenerationParameters = Static<typeof imageGenerationParameters>

export interface CreateImageGenerationExtensionOptions {
  artifactService: {
    materializeConversationImages: (
      conversationId: string,
      ids?: readonly string[],
    ) => Promise<{ images: ImageContent[], records: Array<{ id: string }> }>
    registerGeneratedImages: (input: {
      conversationId: string
      cwd: string
      grants: readonly DirectoryGrant[]
      images: readonly { bytes: Uint8Array, mimeType: string }[]
      outputPath: string
      runId: string
      sourceArtifactId: string | null
      sourceToolCallId: string
    }) => Promise<Array<{ id: string }>>
  }
  attachmentService: {
    materializeConversationImages: (
      conversationId: string,
      ids?: readonly string[],
    ) => Promise<{ images: ImageContent[], records: Array<{ id: string }> }>
  }
  conversationId: string
  cwd: string
  getRunId: () => string | undefined
  grants: readonly DirectoryGrant[]
  imageGenerationGateway: ImageGenerationGateway
}

export function createImageGenerationExtension(
  options: CreateImageGenerationExtensionOptions,
): BuddyInProcessExtension {
  return {
    name: 'lexora-image-generation',
    factory(pi) {
      pi.registerTool(createImageGenerationTool(options))
      pi.on('session_start', (_event, context) => {
        updateImageToolAvailability(pi, options.imageGenerationGateway, context.model)
      })
      pi.on('model_select', (event) => {
        updateImageToolAvailability(pi, options.imageGenerationGateway, event.model)
      })
      pi.on('tool_result', (event) => {
        if (event.toolName !== IMAGE_GENERATION_TOOL_NAME)
          return
        const details = readImageGenerationToolDetails({ details: event.details })
        if (details?.code)
          return { isError: true }
      })
    },
  }
}

function createImageGenerationTool(
  options: CreateImageGenerationExtensionOptions,
): ToolDefinition {
  return defineTool<TSchema, ImageGenerationToolDetails>({
    description: [
      'Generate or edit an image with the active model.',
      'Use reference.mode=resources for exact attachment or artifact ids, or reference.mode=latest for the latest image in this conversation.',
      'Generated images are saved and shown in the Lexora Buddy conversation immediately.',
    ].join(' '),
    execute: async (toolCallId, parameters, signal, _onUpdate, context) => {
      if (!Check(imageGenerationParameters, parameters))
        return imageToolFailure('VALIDATION_FAILED')
      const input = parameters as ImageGenerationParameters
      const outputPath = input.outputPath.trim()
      if (!outputPath || outputPath === '.' || outputPath === '..')
        return imageToolFailure('VALIDATION_FAILED')
      const model = context.model
      if (!model || !options.imageGenerationGateway.supports(model))
        return imageToolFailure('IMAGE_GENERATION_UNSUPPORTED')
      const executionSignal = signal ?? new AbortController().signal
      try {
        const runId = options.getRunId()
        if (!runId)
          return imageToolFailure('VALIDATION_FAILED')
        const references = input.reference
          ? await materializeReferences(options, input.reference)
          : { artifactIds: [], images: [] }
        const generated = await options.imageGenerationGateway.generate({
          inputImages: references.images,
          model,
          prompt: input.prompt.trim(),
          signal: executionSignal,
        })
        const artifacts = await options.artifactService.registerGeneratedImages({
          conversationId: options.conversationId,
          cwd: options.cwd,
          grants: options.grants,
          images: generated.images.map(image => ({
            bytes: Uint8Array.from(image.bytes),
            mimeType: image.mimeType,
          })),
          outputPath,
          runId,
          sourceArtifactId: references.artifactIds.at(-1) ?? null,
          sourceToolCallId: toolCallId,
        })
        const artifactIds = artifacts.map(artifact => artifact.id)
        return {
          content: [{
            text: JSON.stringify({
              artifactIds,
              generatedCount: artifactIds.length,
            }),
            type: 'text' as const,
          }],
          details: {
            artifactIds,
            responseId: generated.responseId,
          },
        }
      }
      catch (error) {
        executionSignal.throwIfAborted()
        const failure = readImageGenerationError(error)
        return imageToolFailure(failure.code, failure.diagnostic)
      }
    },
    label: 'Generate image',
    name: IMAGE_GENERATION_TOOL_NAME,
    parameters: imageGenerationParameters,
    promptGuidelines: [
      'When the user asks to create or generatively edit an image, use lexora_image_generate instead of shell scripts or drawing libraries.',
      'With lexora_image_generate, when the user refers to an image already in the conversation, use reference.mode=resources with its attachmentId or artifactId, or reference.mode=latest.',
      'With lexora_image_generate, set outputPath to the intended path in the current workspace. The tool appends the image extension when omitted and numeric suffixes when one call returns multiple images.',
    ],
  })
}

async function materializeReferences(
  options: CreateImageGenerationExtensionOptions,
  reference: NonNullable<ImageGenerationParameters['reference']>,
): Promise<{ artifactIds: string[], images: ImageContent[] }> {
  if (reference.mode === 'latest') {
    const artifacts = await options.artifactService.materializeConversationImages(
      options.conversationId,
    )
    if (artifacts.images.length > 0) {
      return {
        artifactIds: artifacts.records.map(record => record.id),
        images: artifacts.images,
      }
    }
    const attachments = await options.attachmentService.materializeConversationImages(
      options.conversationId,
    )
    return { artifactIds: [], images: attachments.images }
  }

  const artifactIds: string[] = []
  const images: ImageContent[] = []
  for (const resourceId of reference.resourceIds) {
    try {
      const artifacts = await options.artifactService.materializeConversationImages(
        options.conversationId,
        [resourceId],
      )
      artifactIds.push(resourceId)
      images.push(...artifacts.images)
    }
    catch (error) {
      if ((error as { code?: unknown }).code !== 'ARTIFACT_NOT_FOUND')
        throw error
      const attachments = await options.attachmentService.materializeConversationImages(
        options.conversationId,
        [resourceId],
      )
      images.push(...attachments.images)
    }
  }
  return { artifactIds, images }
}

function imageToolFailure(
  code: ImageGenerationErrorCode | 'VALIDATION_FAILED',
  diagnostic: ImageGenerationErrorDiagnostic | null = null,
) {
  const diagnosticText = diagnostic
    ? Object.entries(diagnostic).map(([key, value]) => `${key}=${value}`).join(', ')
    : ''
  return {
    content: [{
      text: `Lexora Buddy image generation failed: ${code}${diagnosticText ? ` (${diagnosticText})` : ''}`,
      type: 'text' as const,
    }],
    details: {
      artifactIds: [],
      code,
      ...(diagnostic ? { diagnostic } : {}),
      responseId: null,
    },
  }
}

function updateImageToolAvailability(
  pi: {
    getActiveTools: () => string[]
    setActiveTools: (names: string[]) => void
  },
  gateway: ImageGenerationGateway,
  model: Parameters<ImageGenerationGateway['supports']>[0] | undefined,
): void {
  const active = new Set(pi.getActiveTools())
  if (model && gateway.supports(model))
    active.add(IMAGE_GENERATION_TOOL_NAME)
  else
    active.delete(IMAGE_GENERATION_TOOL_NAME)
  pi.setActiveTools([...active])
}
