import type { Api, Model } from '@earendil-works/pi-ai'
import { getSupportedThinkingLevels } from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import { modelCapabilitiesSchema, modelCapabilityOverridesSchema } from '../../../../shared/providers/providerCapabilities'
import { applyModelCapabilities, supportsModelPdfInput } from '../modelCapabilities'

function model(): Model<Api> {
  return {
    id: 'example-model',
    name: 'Example model',
    provider: 'relay',
    api: 'openai-completions',
    baseUrl: 'https://relay.example.test/v1',
    input: ['text'],
    reasoning: true,
    thinkingLevelMap: { low: null, high: 'enabled', max: null },
    contextWindow: 128_000,
    maxTokens: 16_384,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    compat: { supportsDeveloperRole: false },
  }
}

describe('model capability overrides', () => {
  it('applies only explicit fields while following current source capabilities for the rest', () => {
    const source = { ...model(), pdfInput: true }
    const imageOnly = modelCapabilityOverridesSchema.parse({ image: true })
    const effective = applyModelCapabilities(source, imageOnly)
    expect(imageOnly).toEqual({ image: true })
    expect(effective.input).toEqual(['text', 'image'])
    expect(effective.thinkingLevelMap).toEqual(source.thinkingLevelMap)
    expect(supportsModelPdfInput(effective)).toBe(true)

    const updated = { ...source, thinkingLevelMap: { off: 'none', low: 'low', max: 'max' }, pdfInput: false }
    const refreshed = applyModelCapabilities(updated, imageOnly)
    expect(refreshed.thinkingLevelMap).toEqual(updated.thinkingLevelMap)
    expect(supportsModelPdfInput(refreshed)).toBe(false)
    expect(applyModelCapabilities({ ...updated, input: ['text', 'image'] }, { reasoningOptions: ['off'] }).input).toEqual(['text', 'image'])
  })

  it('requires resolved PDF metadata instead of inferring support from images or hostnames', () => {
    const official = { ...model(), baseUrl: 'https://api.openai.com/v1', pdfInput: true, input: ['text', 'image'] as Array<'text' | 'image'> }
    expect(supportsModelPdfInput(official)).toBe(true)
    expect(supportsModelPdfInput({ ...official, pdfInput: undefined })).toBe(false)
    expect(supportsModelPdfInput(applyModelCapabilities(official, { image: true, pdf: false, reasoningOptions: ['off'] }))).toBe(false)
    expect(supportsModelPdfInput(applyModelCapabilities(model(), { image: false, pdf: true, reasoningOptions: ['off'] }))).toBe(true)
    expect(supportsModelPdfInput(applyModelCapabilities({ ...official, api: 'azure-openai-responses' }, { image: true, pdf: true, reasoningOptions: ['off'] }))).toBe(false)
    expect(supportsModelPdfInput(applyModelCapabilities(official, { image: false, reasoningOptions: ['off'] }))).toBe(true)
  })

  it('keeps resolved PDF input independent of image support and preserves explicit overrides', () => {
    const codex = { ...model(), api: 'openai-codex-responses', pdfInput: true, provider: 'codex-instance', baseUrl: 'https://chatgpt.com/backend-api', input: ['text', 'image'] as Array<'text' | 'image'> }
    expect(supportsModelPdfInput(codex)).toBe(true)
    expect(supportsModelPdfInput({ ...codex, input: ['text'] })).toBe(true)
    expect(supportsModelPdfInput({ ...codex, pdfInput: false })).toBe(false)
    expect(supportsModelPdfInput(applyModelCapabilities(codex, { image: true, pdf: false, reasoningOptions: ['off'] }))).toBe(false)
    expect(supportsModelPdfInput(applyModelCapabilities(codex, { image: true, reasoningOptions: ['off'] }))).toBe(true)
  })

  it('uses exactly the selected levels while preserving native effort mapping and route metadata', () => {
    const source = model()
    const effective = applyModelCapabilities(source, { image: true, reasoningOptions: ['low', 'high', 'max'] })
    expect(getSupportedThinkingLevels(effective)).toEqual(['low', 'high', 'max'])
    expect(effective).toMatchObject({
      input: ['text', 'image'],
      reasoning: true,
      thinkingLevelMap: { off: null, high: 'enabled', max: 'max' },
      provider: source.provider,
      api: source.api,
      baseUrl: source.baseUrl,
      id: source.id,
      compat: source.compat,
      contextWindow: source.contextWindow,
      maxTokens: source.maxTokens,
    })
    expect(source.input).toEqual(['text'])
    expect(source.thinkingLevelMap).toEqual({ low: null, high: 'enabled', max: null })
  })

  it('disables image and thinking without disabling text, and restores the unchanged source', () => {
    const source = { ...model(), input: ['text', 'image'] as Array<'text' | 'image'> }
    const effective = applyModelCapabilities(source, { image: false, reasoningOptions: ['off'] })
    expect(effective.input).toEqual(['text'])
    expect(effective.reasoning).toBe(false)
    expect(getSupportedThinkingLevels(effective)).toEqual(['off'])
    expect(applyModelCapabilities(source, null)).toEqual(source)
  })

  it.each([
    { reasoningOptions: [] },
    { reasoningOptions: ['high', 'high'] },
    { reasoningOptions: ['unsupported'] },
  ])('rejects invalid reasoning options $reasoningOptions', ({ reasoningOptions }) => {
    expect(modelCapabilitiesSchema.safeParse({ image: false, reasoningOptions }).success).toBe(false)
    expect(modelCapabilityOverridesSchema.safeParse({ reasoningOptions }).success).toBe(false)
  })
})
