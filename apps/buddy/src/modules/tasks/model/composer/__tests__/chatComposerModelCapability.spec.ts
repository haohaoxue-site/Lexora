import type { LocalRuntimeModelOption } from '@buddy-shared/providers/providerApi'

import { describe, expect, it } from 'vitest'
import { resolveChatComposerModelInputIssue } from '../chatComposerModelCapability'

function model(capabilities: readonly string[]): LocalRuntimeModelOption {
  return {
    available: true,
    catalogMatch: 'not_applicable',
    catalog: { source: null, selection: null, candidates: [] },
    metadataKnown: true,
    capabilityOverrides: null,
    fileInputMimeTypes: capabilities.includes('pdf') ? ['application/pdf'] : [],
    sourceCapabilities: { image: capabilities.includes('image'), reasoningOptions: ['off'] },
    api: 'openai-completions',
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
  it('checks the concrete audio format even when audio input is enabled', () => {
    const audioModel: LocalRuntimeModelOption = { ...model(['text', 'audio']), fileInputMimeTypes: ['audio/wav', 'audio/mpeg'] }
    const resources = [{ resource: { resourceId: 'audio-1', kind: 'audio' as const, mimeType: 'audio/mp4' } }]
    expect(resolveChatComposerModelInputIssue({ model: audioModel, resources, resourceIds: ['audio-1'] })).toBe('audio_unsupported')
    expect(resolveChatComposerModelInputIssue({ model: { ...audioModel, fileInputMimeTypes: [...audioModel.fileInputMimeTypes, 'audio/mp4'] }, resources, resourceIds: ['audio-1'] })).toBeNull()
  })
  it('checks PDF independently from images and only for referenced resources', () => {
    const resources = [{ resource: { resourceId: 'pdf-1', kind: 'pdf' as const, mimeType: 'application/pdf' } }]
    expect(resolveChatComposerModelInputIssue({ model: model(['text', 'image']), resources, resourceIds: ['pdf-1'] })).toBe('pdf_unsupported')
    expect(resolveChatComposerModelInputIssue({ model: model(['text', 'pdf']), resources, resourceIds: ['pdf-1'] })).toBeNull()
    expect(resolveChatComposerModelInputIssue({ model: model(['text']), resources, resourceIds: [] })).toBeNull()
  })

  it('checks referenced images against the current model capabilities', () => {
    const input = {
      resourceIds: ['resource-1'],
      resources: [{ resource: { resourceId: 'resource-1', kind: 'image' as const, mimeType: 'image/png' } }],
    }

    expect(resolveChatComposerModelInputIssue({ ...input, model: model(['text']) })).toBe('image_unsupported')
    expect(resolveChatComposerModelInputIssue({ ...input, model: model(['text', 'image']) })).toBeNull()
  })
})
