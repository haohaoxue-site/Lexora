import type { LocalRuntimeModelOption } from '@buddy-shared/providers/providerApi'

import type { ComposerResourceView } from '../../../state/composer/typing'
import { describe, expect, it } from 'vitest'
import { resolveChatComposerModelInputIssue } from '../chatComposerModelCapability'

function model(capabilities: readonly string[]): LocalRuntimeModelOption {
  return {
    available: true,
    capabilities: [...capabilities],
    contextWindow: 128_000,
    displayName: 'Fixture',
    enabled: true,
    hasParameterOverride: false,
    lastSeenAt: null,
    maxTokens: 4_096,
    modelId: 'fixture',
    overrideContextWindow: null,
    overrideMaxTokens: null,
    providerId: 'fixture',
    reasoningOptions: [],
    serviceTiers: [],
    source: 'builtin',
    sourceContextWindow: 128_000,
    sourceMaxTokens: 4_096,
    sourceParametersUpdated: false,
  }
}

describe('composer model capability', () => {
  it('keeps a ready image intact while send eligibility follows the current model', () => {
    const image: ComposerResourceView = {
      accepted: true,
      canRetry: false,
      resource: {
        attachmentId: 'attachment-1',
        draftId: 'draft-1',
        kind: 'image',
        mimeType: 'image/png',
        name: 'image.png',
        previewUrl: null,
        resourceId: 'resource-1',
        sizeBytes: 1,
        state: 'ready',
      },
    }
    const input = { resourceIds: ['resource-1'], resources: [image] }

    expect(resolveChatComposerModelInputIssue({ ...input, model: model(['text']) })).toBe('image_unsupported')
    expect(image.resource.state).toBe('ready')
    expect(resolveChatComposerModelInputIssue({ ...input, model: model(['text', 'image']) })).toBeNull()
    expect(resolveChatComposerModelInputIssue({ ...input, model: model(['text']) })).toBe('image_unsupported')
  })
})
