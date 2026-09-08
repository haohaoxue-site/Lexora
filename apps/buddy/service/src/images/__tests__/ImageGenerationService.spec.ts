import type { Model } from '@earendil-works/pi-ai'
import type { ImageGenerationServiceOptions } from '../ImageGenerationService'
import { describe, expect, it } from 'vitest'
import { ImageGenerationService } from '../ImageGenerationService'

const image = { type: 'image' as const, mimeType: 'image/png', data: 'fixture' }
const model = { provider: 'fixture', id: 'fixture' } as Model<'openai-responses'>

describe('conversation image generation', () => {
  it('preserves reference order and uses the last artifact reference for lineage', async () => {
    const references: string[] = []
    let saved: Parameters<ImageGenerationServiceOptions['artifactService']['registerGeneratedImages']>[0] | undefined
    const service = new ImageGenerationService({
      conversationId: 'conversation-1',
      cwd: '/workspace',
      grants: [],
      artifactService: {
        async materializeConversationImages(_conversationId, ids) {
          if (ids?.[0] === 'attachment-1')
            throw Object.assign(new Error('Not an artifact'), { code: 'ARTIFACT_NOT_FOUND' })
          return { images: [{ ...image, data: ids![0]! }], records: [{ id: ids![0]! }] }
        },
        async registerGeneratedImages(input) {
          saved = input
          return [{ id: 'generated-1' }]
        },
      },
      attachmentService: {
        materializeConversationImages: async () => ({ images: [{ ...image, data: 'attachment-1' }], records: [{ id: 'attachment-1' }] }),
      },
      imageGenerationGateway: {
        supports: () => true,
        async generate(input) {
          references.push(...input.inputImages.map(item => item.data))
          return { images: [{ bytes: new Uint8Array([1]), mimeType: 'image/png' }], responseId: 'response-1' }
        },
      },
    })
    await expect(service.generate({ outputPath: ' result.png ', prompt: 'use references', reference: { mode: 'resources', resourceIds: ['artifact-1', 'attachment-1', 'artifact-2'] } }, model, new AbortController().signal)).resolves.toEqual({ artifactIds: ['generated-1'], responseId: 'response-1' })
    expect(references).toEqual(['artifact-1', 'attachment-1', 'artifact-2'])
    expect(saved).toMatchObject({ sourceArtifactId: 'artifact-2', outputPath: 'result.png', conversationId: 'conversation-1' })
  })

  it('does not persist generated output when cancellation arrives during the provider request', async () => {
    const controller = new AbortController()
    let saved = false
    const source = { materializeConversationImages: async () => ({ images: [], records: [] }) }
    const service = new ImageGenerationService({
      conversationId: 'conversation-1',
      cwd: '/workspace',
      grants: [],
      artifactService: {
        ...source,
        async registerGeneratedImages() {
          saved = true
          return [{ id: 'generated-1' }]
        },
      },
      attachmentService: source,
      imageGenerationGateway: {
        supports: () => true,
        async generate() {
          controller.abort(new Error('cancelled'))
          return { images: [{ bytes: new Uint8Array([1]), mimeType: 'image/png' }], responseId: 'response-1' }
        },
      },
    })
    await expect(service.generate({ outputPath: 'result.png', prompt: 'generate' }, model, controller.signal)).rejects.toThrow('cancelled')
    expect(saved).toBe(false)
  })
})
