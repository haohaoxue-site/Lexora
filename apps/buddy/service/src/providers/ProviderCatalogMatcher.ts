import type { ModelCatalogReference } from '../../../shared/providers/providerCatalog'
import type { CatalogModel, ModelMetadataCatalog } from './ModelsDevCatalog'
import { serializeModelMetadata } from './modelMetadata'

export type ProviderCatalogMatch = {
  candidates: readonly CatalogModel[]
  model: CatalogModel
  status: 'matched'
} | {
  candidates: readonly CatalogModel[]
  status: 'ambiguous' | 'unmatched'
}

interface CatalogMatchInput {
  api: string
  baseUrl: string
  modelId: string
  providerId?: string
  selection?: ModelCatalogReference | null
}

const MODEL_ORIGINS: ReadonlyArray<{ pattern: RegExp, providers: readonly string[] }> = [
  { pattern: /^(?:gpt-|chatgpt-|o[134](?:-|$))/u, providers: ['openai'] },
  { pattern: /^claude-/u, providers: ['anthropic'] },
  { pattern: /^gemini-/u, providers: ['google'] },
  { pattern: /^deepseek-/u, providers: ['deepseek'] },
  { pattern: /^glm-/u, providers: ['zai', 'zhipuai'] },
  { pattern: /^(?:kimi-|moonshot-)/u, providers: ['moonshotai', 'moonshotai-cn'] },
  { pattern: /^minimax-/u, providers: ['minimax', 'minimax-cn'] },
  { pattern: /^grok-/u, providers: ['xai'] },
  { pattern: /^(?:qwen|qwq)/u, providers: ['alibaba', 'alibaba-cn'] },
  { pattern: /^(?:mistral-|magistral-|codestral-|devstral-|ministral-|pixtral-)/u, providers: ['mistral'] },
]

const MODEL_NAMESPACES = new Set([
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'deepseek-ai',
  'zai',
  'z-ai',
  'zhipuai',
  'moonshot',
  'moonshotai',
  'minimax',
  'xai',
  'x-ai',
  'qwen',
  'alibaba',
  'mistralai',
  'meta-llama',
])

export class ProviderCatalogMatcher {
  readonly #runtime: ModelMetadataCatalog

  constructor(runtime: ModelMetadataCatalog) {
    this.#runtime = runtime
  }

  providerName(providerId: string): string {
    return this.#runtime.getProviders().find(provider => provider.id === providerId)?.name ?? providerId
  }

  match(input: CatalogMatchInput): ProviderCatalogMatch {
    const available = this.#runtime.getProviders().flatMap(provider => this.#runtime.getModels(provider.id))
    const requested = input.modelId.trim().toLowerCase()
    const candidates = available.filter(model => catalogModelKey(model.id) === catalogModelKey(requested))
    candidates.sort((left, right) => left.provider.localeCompare(right.provider) || left.id.localeCompare(right.id))
    const selection = input.selection
    if (selection) {
      const model = candidates.find(model => model.provider === selection.providerId
        && model.id === selection.modelId)
      if (!model)
        return { candidates, status: 'unmatched' }
      return { candidates, model, status: 'matched' }
    }
    if (candidates.length === 0)
      return { candidates, status: 'unmatched' }

    const normalizedBaseUrl = normalizeProviderBaseUrl(input.baseUrl)
    const endpointMatches = candidates.filter(model => (
      Boolean(normalizedBaseUrl) && normalizeProviderBaseUrl(model.baseUrl) === normalizedBaseUrl
    ))
    const providerId = input.providerId === 'openai-codex' ? 'openai' : input.providerId
    const providerMatches = candidates.filter(model => model.provider === providerId)
    let preferred = endpointMatches.length ? endpointMatches : providerMatches.length ? providerMatches : candidates
    if (!endpointMatches.length && !providerMatches.length) {
      const origins = MODEL_ORIGINS.find(origin => origin.pattern.test(catalogModelKey(requested)))?.providers ?? []
      for (const providerId of origins) {
        const models = candidates.filter(model => model.provider === providerId)
        if (models.length) {
          preferred = models
          break
        }
      }
    }
    const exact = preferred.filter(model => model.id.toLowerCase() === requested)
    if (exact.length)
      preferred = exact
    const first = preferred[0]!
    const fingerprint = catalogCapabilityFingerprint(first)
    if (preferred.every(model => catalogCapabilityFingerprint(model) === fingerprint))
      return { candidates, model: first, status: 'matched' }
    return { candidates, status: 'ambiguous' }
  }

  find(reference: ModelCatalogReference): CatalogModel | undefined {
    return this.#runtime.getModels(reference.providerId).find(model => model.id === reference.modelId)
  }
}

function catalogModelKey(value: string): string {
  const normalized = value.trim().toLowerCase()
  const separator = normalized.indexOf('/')
  return separator > 0 && MODEL_NAMESPACES.has(normalized.slice(0, separator))
    ? normalized.slice(separator + 1)
    : normalized
}

function catalogCapabilityFingerprint(model: CatalogModel): string {
  return serializeModelMetadata({
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    input: [...new Set(model.input)].sort(),
    reasoning: model.reasoning,
    thinkingLevelMap: model.thinkingLevelMap ?? null,
    pdfInput: model.pdfInput ?? false,
    audioInput: model.audioInput ?? false,
    videoInput: model.videoInput ?? false,
    toolCall: model.toolCall !== false,
  })
}

export function normalizeProviderBaseUrl(value: string): string {
  try {
    const url = new URL(value)
    const pathname = url.pathname
      .replace(/\/+$/u, '')
      .replace(/\/(?:v1|v1beta|v1alpha)$/iu, '')
    return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${pathname}`
  }
  catch {
    return value.trim().replace(/\/+$/u, '').toLowerCase()
  }
}
