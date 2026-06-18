#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..')
const DEFAULT_OUTPUT = path.join(
  REPO_ROOT,
  'apps/api/src/modules/ai/generated/model-capability-defaults.generated.json',
)
const DEFAULT_CACHE_DIR = path.join(REPO_ROOT, 'infrastructure/.cache/model-capability-defaults')
const DEFAULT_SOURCE_LIMIT = 300
const DEFAULT_MAX_MODELS = 96
const REQUEST_TIMEOUT_MS = 30_000
const SCHEMA_VERSION = 1

const SOURCE_URLS = {
  openrouter: 'https://openrouter.ai/api/v1/models',
  litellm: 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json',
  huggingface: 'https://huggingface.co/api/models?sort=downloads&direction=-1&limit=300&full=true',
}

const SOURCE_RANK = {
  openrouter: 4,
  litellm: 3,
  huggingface_hub: 1,
}

const CURATED_PROVIDER_KEYS = new Set([
  'anthropic',
  'azure',
  'bedrock',
  'cohere',
  'deepinfra',
  'deepseek',
  'fireworks',
  'fireworks_ai',
  'gemini',
  'google',
  'groq',
  'huggingface',
  'jina',
  'jina_ai',
  'meta-llama',
  'mistral',
  'openai',
  'openrouter',
  'perplexity',
  'qwen',
  'together',
  'together_ai',
  'vertex_ai',
  'voyage',
  'xai',
])

const UNSTABLE_MODEL_ID_PARTS = new Set([
  'alpha',
  'beta',
  'build',
  'experimental',
  'exp',
  'fast',
  'free',
  'latest',
  'preview',
  'rc',
  'snapshot',
])

const args = parseArgs(process.argv.slice(2))
const sourceLimit = positiveIntegerOrDefault(args.limit, DEFAULT_SOURCE_LIMIT)
const maxModels = positiveIntegerOrDefault(args.maxModels, DEFAULT_MAX_MODELS)
const outputPath = args.output ? path.resolve(REPO_ROOT, args.output) : DEFAULT_OUTPUT
const cacheDir = args.cacheDir ? path.resolve(REPO_ROOT, args.cacheDir) : DEFAULT_CACHE_DIR
const enabledSources = new Set(args.sources?.length ? args.sources : Object.keys(SOURCE_URLS))

const rawSources = await loadSources({ enabledSources, sourceLimit, cacheDir })
const normalized = normalizeSources(rawSources, sourceLimit)
await writeCacheJson(cacheDir, 'normalized.json', normalized)

const mergeResult = mergeDefaults(normalized.entries, { maxModels })
const generatedAt = new Date().toISOString()
const curation = {
  maxModels,
  sourceLimit,
  includedModels: mergeResult.models.length,
  excludedCandidates: mergeResult.excluded.length,
  filters: [
    'provider-aware metadata first',
    'drop rolling aliases and preview/free/experimental model ids',
    'drop low-confidence Hugging Face Hub chat entries without limits',
    'limit low-signal image/audio entries and overrepresented model families',
    'output source-free model defaults keyed by modelId',
    'keep source metadata in cache report only',
  ],
}
const finalDefaults = {
  schemaVersion: SCHEMA_VERSION,
  generatedAt,
  models: mergeResult.models,
}

const report = {
  schemaVersion: SCHEMA_VERSION,
  generatedAt,
  curation,
  sources: rawSources.map(source => source.summary),
  normalizedSummary: buildNormalizedSummary(normalized.entries),
  finalSummary: buildFinalSummary(finalDefaults.models),
  conflicts: mergeResult.conflicts,
  excluded: mergeResult.excluded,
}

await writeJsonAtomic(outputPath, finalDefaults)
await writeCacheJson(cacheDir, 'report.json', report)
printSummary(finalDefaults, report, outputPath, cacheDir)

if (finalDefaults.models.length === 0 && rawSources.every(source => source.summary.status !== 'skipped')) {
  process.exitCode = 1
}

function parseArgs(rawArgs) {
  const parsed = {
    limit: DEFAULT_SOURCE_LIMIT,
    maxModels: DEFAULT_MAX_MODELS,
    output: '',
    cacheDir: '',
    sources: [],
    useCache: false,
  }

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index]

    if (arg === '--limit') {
      parsed.limit = Number.parseInt(rawArgs[index + 1] ?? '', 10)
      index += 1
      continue
    }
    if (arg.startsWith('--limit=')) {
      parsed.limit = Number.parseInt(arg.slice('--limit='.length), 10)
      continue
    }

    if (arg === '--max-models') {
      parsed.maxModels = Number.parseInt(rawArgs[index + 1] ?? '', 10)
      index += 1
      continue
    }
    if (arg.startsWith('--max-models=')) {
      parsed.maxModels = Number.parseInt(arg.slice('--max-models='.length), 10)
      continue
    }

    if (arg === '--output') {
      parsed.output = rawArgs[index + 1] ?? ''
      index += 1
      continue
    }
    if (arg.startsWith('--output=')) {
      parsed.output = arg.slice('--output='.length)
      continue
    }

    if (arg === '--cache-dir') {
      parsed.cacheDir = rawArgs[index + 1] ?? ''
      index += 1
      continue
    }
    if (arg.startsWith('--cache-dir=')) {
      parsed.cacheDir = arg.slice('--cache-dir='.length)
      continue
    }

    if (arg === '--sources') {
      parsed.sources = splitSources(rawArgs[index + 1] ?? '')
      index += 1
      continue
    }
    if (arg.startsWith('--sources=')) {
      parsed.sources = splitSources(arg.slice('--sources='.length))
      continue
    }

    if (arg === '--use-cache') {
      parsed.useCache = true
    }
  }

  return parsed
}

function splitSources(value) {
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

function positiveIntegerOrDefault(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback
}

async function loadSources(input) {
  const sourceTasks = [
    input.enabledSources.has('openrouter')
      ? loadSource('openrouter', input.cacheDir, () => fetchJson(SOURCE_URLS.openrouter))
      : skippedSource('openrouter'),
    input.enabledSources.has('litellm')
      ? loadSource('litellm', input.cacheDir, () => fetchJson(SOURCE_URLS.litellm))
      : skippedSource('litellm'),
    input.enabledSources.has('huggingface')
      ? loadSource('huggingface', input.cacheDir, () => fetchJson(SOURCE_URLS.huggingface))
      : skippedSource('huggingface'),
  ]

  return await Promise.all(sourceTasks)
}

async function loadSource(key, cacheDir, fetcher) {
  try {
    const payload = args.useCache
      ? await readCacheJson(cacheDir, `${key}.raw.json`)
      : await fetcher()
    await writeCacheJson(cacheDir, `${key}.raw.json`, payload)

    return {
      key,
      payload,
      summary: {
        key,
        url: SOURCE_URLS[key],
        status: 'ok',
        rawCount: countRawRecords(key, payload),
      },
    }
  }
  catch (error) {
    return {
      key,
      payload: null,
      summary: {
        key,
        url: SOURCE_URLS[key],
        status: 'failed',
        rawCount: 0,
        error: error instanceof Error ? error.message : String(error),
      },
    }
  }
}

async function skippedSource(key) {
  return {
    key,
    payload: null,
    summary: {
      key,
      url: SOURCE_URLS[key] ?? null,
      status: 'skipped',
      rawCount: 0,
    },
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Lexora model capability defaults sync',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`)
  }

  return await response.json()
}

async function readCacheJson(cacheDir, filename) {
  return JSON.parse(await readFile(path.join(cacheDir, filename), 'utf8'))
}

async function writeCacheJson(cacheDir, filename, value) {
  await writeJsonAtomic(path.join(cacheDir, filename), value)
}

async function writeJsonAtomic(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true })
  await writeFile(`${filename}.tmp`, `${JSON.stringify(value, null, 2)}\n`)
  await rename(`${filename}.tmp`, filename)
}

function countRawRecords(key, payload) {
  if (key === 'openrouter') {
    return Array.isArray(payload?.data) ? payload.data.length : 0
  }
  if (key === 'litellm') {
    return isRecord(payload) ? Object.keys(payload).length : 0
  }
  if (key === 'huggingface') {
    return Array.isArray(payload) ? payload.length : 0
  }

  return 0
}

function normalizeSources(rawSources, limit) {
  const entries = []

  for (const source of rawSources) {
    if (source.summary.status !== 'ok') {
      continue
    }

    if (source.key === 'openrouter') {
      const records = Array.isArray(source.payload?.data) ? source.payload.data : []
      entries.push(...records.slice(0, limit).map(normalizeOpenRouterModel).filter(Boolean))
    }

    if (source.key === 'litellm') {
      const records = Object.entries(isRecord(source.payload) ? source.payload : {})
        .filter(([, value]) => isRecord(value))
        .slice(0, limit)
      entries.push(...records.map(([modelId, record]) => normalizeLiteLlmModel(modelId, record)).filter(Boolean))
    }

    if (source.key === 'huggingface') {
      const records = Array.isArray(source.payload) ? source.payload : []
      entries.push(...records.slice(0, limit).map(normalizeHuggingFaceModel).filter(Boolean))
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    entries,
  }
}

function normalizeOpenRouterModel(record) {
  if (!isRecord(record)) {
    return null
  }

  const modelId = getString(record.id)
  if (!modelId) {
    return null
  }

  const architecture = isRecord(record.architecture) ? record.architecture : {}
  const supportedParameters = getStringArray(record.supported_parameters)
  const topProvider = isRecord(record.top_provider) ? record.top_provider : {}
  const inputModalities = normalizeModalities(getStringArray(architecture.input_modalities))
  const outputModalities = normalizeModalities(getStringArray(architecture.output_modalities))

  return createNormalizedEntry({
    source: 'openrouter',
    providerKey: 'openrouter',
    modelId,
    modelName: getString(record.name) ?? modelId,
    modelType: inferModelType({
      modelId,
      inputModalities,
      outputModalities,
      sourceType: getString(architecture.modality),
    }),
    inputModalities,
    outputModalities,
    capabilities: inferCapabilities({
      supportedParameters,
      inputModalities,
      outputModalities,
      record,
    }),
    limits: {
      contextWindow: getPositiveInteger(record.context_length) ?? getPositiveInteger(topProvider.context_length),
      maxOutputTokens: getPositiveInteger(topProvider.max_completion_tokens),
    },
    popularity: {
      downloads: null,
      likes: null,
    },
  })
}

function normalizeLiteLlmModel(modelId, record) {
  const modelInfo = isRecord(record.model_info) ? record.model_info : {}
  const inputModalities = normalizeModalities([
    ...getStringArray(record.input_modalities),
    ...(record.supports_vision === true ? ['image'] : []),
  ])
  const outputModalities = normalizeModalities(getStringArray(record.output_modalities))
  const providerKey = normalizeProviderKey(
    getString(record.litellm_provider)
    ?? getString(modelInfo.litellm_provider)
    ?? inferProviderKeyFromModelId(modelId),
  )

  return createNormalizedEntry({
    source: 'litellm',
    providerKey,
    modelId,
    modelName: getString(modelInfo.display_name) ?? modelId,
    modelType: inferModelType({
      modelId,
      mode: getString(record.mode),
      inputModalities,
      outputModalities,
    }),
    inputModalities,
    outputModalities,
    capabilities: inferCapabilities({
      inputModalities,
      outputModalities,
      record,
    }),
    limits: {
      contextWindow: getPositiveInteger(record.max_input_tokens) ?? getPositiveInteger(record.max_tokens),
      maxOutputTokens: getPositiveInteger(record.max_output_tokens),
    },
    popularity: {
      downloads: null,
      likes: null,
    },
  })
}

function normalizeHuggingFaceModel(record) {
  if (!isRecord(record)) {
    return null
  }

  const modelId = getString(record.id) ?? getString(record.modelId)
  if (!modelId) {
    return null
  }

  const pipelineTag = getString(record.pipeline_tag)
  const tags = getStringArray(record.tags)
  const config = isRecord(record.config) ? record.config : {}
  const inputModalities = inferHuggingFaceInputModalities(pipelineTag, tags)
  const outputModalities = inferHuggingFaceOutputModalities(pipelineTag, tags)

  return createNormalizedEntry({
    source: 'huggingface_hub',
    providerKey: 'huggingface',
    modelId,
    modelName: modelId,
    modelType: inferModelType({
      modelId,
      pipelineTag,
      inputModalities,
      outputModalities,
    }),
    inputModalities,
    outputModalities,
    capabilities: inferCapabilities({
      inputModalities,
      outputModalities,
      tags,
    }),
    limits: {
      contextWindow: inferContextWindowFromConfig(config),
      maxOutputTokens: null,
    },
    popularity: {
      downloads: getPositiveInteger(record.downloads),
      likes: getPositiveInteger(record.likes),
    },
  })
}

function createNormalizedEntry(input) {
  const inputModalities = input.modelType === 'rerank'
    ? ['text']
    : input.inputModalities.length > 0
      ? input.inputModalities
      : ['text']
  const outputModalities = input.outputModalities.length > 0
    ? input.outputModalities
    : inferDefaultOutputModalities(input.modelType)

  return {
    entryId: `${input.source}:${input.providerKey}:${input.modelId}`,
    source: input.source,
    sourceRank: SOURCE_RANK[input.source] ?? 0,
    providerKey: input.providerKey,
    modelId: input.modelId,
    canonicalModelId: canonicalizeModelId(input.modelId),
    modelName: input.modelName,
    modelType: input.modelType,
    inputModalities,
    outputModalities: input.modelType === 'rerank' ? ['text'] : outputModalities,
    capabilities: uniqueStrings(input.capabilities).sort(),
    limits: {
      contextWindow: input.limits.contextWindow ?? null,
      maxOutputTokens: input.limits.maxOutputTokens ?? null,
    },
    popularity: {
      downloads: input.popularity.downloads ?? null,
      likes: input.popularity.likes ?? null,
    },
    score: 0,
  }
}

function mergeDefaults(entries, options) {
  const candidates = entries
    .map(entry => ({
      ...entry,
      score: scoreEntry(entry),
    }))
    .filter(entry => shouldKeepCandidate(entry))

  const grouped = groupBy(candidates, entry => entry.canonicalModelId)
  const merged = []
  const conflicts = []

  for (const [canonicalModelId, groupEntries] of grouped.entries()) {
    const best = pickBestEntry(groupEntries)
    const contextWindow = chooseLimit(groupEntries, 'contextWindow')
    const maxOutputTokens = chooseLimit(groupEntries, 'maxOutputTokens')
    const modelTypes = uniqueStrings(groupEntries.map(entry => entry.modelType))

    if (modelTypes.length > 1) {
      conflicts.push({
        canonicalModelId,
        kind: 'modelType',
        values: modelTypes,
      })
    }

    merged.push({
      modelId: canonicalModelId,
      modelName: best.modelName,
      modelType: best.modelType,
      providerKeys: uniqueStrings(groupEntries.map(entry => entry.providerKey)).sort(),
      inputModalities: uniqueStrings(groupEntries.flatMap(entry => entry.inputModalities)).sort(),
      outputModalities: uniqueStrings(groupEntries.flatMap(entry => entry.outputModalities)).sort(),
      capabilities: uniqueStrings(groupEntries.flatMap(entry => entry.capabilities)).sort(),
      limits: {
        contextWindow,
        maxOutputTokens,
      },
      quality: {
        score: Math.max(...groupEntries.map(entry => entry.score)),
        freshness: scoreModelFreshness(canonicalModelId),
        confidence: confidenceFromScore(Math.max(...groupEntries.map(entry => entry.score))),
      },
    })
  }

  const sorted = sortFinalModels(merged)
  const models = applyTypeLimits(sorted).slice(0, options.maxModels)
  const includedIds = new Set(models.map(model => model.modelId))
  const excluded = sorted
    .filter(model => !includedIds.has(model.modelId))
    .map(model => ({
      modelId: model.modelId,
      modelType: model.modelType,
      score: model.quality.score,
      reason: 'over_limit',
    }))

  return {
    models: models.map(stripInternalQualityScore),
    excluded,
    conflicts,
  }
}

function shouldKeepCandidate(entry) {
  if (!entry.modelId || entry.providerKey === 'unknown') {
    return false
  }

  if (isLowSignalModelId(entry.modelId)) {
    return false
  }

  if (hasUnstableModelId(entry.modelId)) {
    return false
  }

  if (entry.source === 'huggingface_hub') {
    if (entry.modelType === 'chat') {
      return Boolean(entry.limits.contextWindow) && (entry.popularity.downloads ?? 0) >= 100_000
    }

    return (entry.popularity.downloads ?? 0) >= 250_000
  }

  if (!CURATED_PROVIDER_KEYS.has(entry.providerKey) && entry.sourceRank < 4) {
    return false
  }

  if (entry.modelType === 'image' || entry.modelType === 'audio') {
    return entry.sourceRank >= 4 || entry.score >= 105
  }

  return entry.score >= 80
}

function scoreEntry(entry) {
  let score = (entry.sourceRank ?? 0) * 30

  if (CURATED_PROVIDER_KEYS.has(entry.providerKey)) {
    score += 20
  }
  if (entry.limits.contextWindow) {
    score += 20
  }
  if (entry.limits.maxOutputTokens) {
    score += 10
  }
  if (entry.capabilities.includes('tool_call')) {
    score += 8
  }
  if (entry.capabilities.includes('structured_output')) {
    score += 6
  }
  if (entry.inputModalities.includes('image')) {
    score += 4
  }
  if (!hasUnstableModelId(entry.modelId)) {
    score += 8
  }
  if (isPreferredVendor(entry.modelId)) {
    score += 12
  }
  if ((entry.popularity.downloads ?? 0) >= 1_000_000) {
    score += 20
  }
  else if ((entry.popularity.downloads ?? 0) >= 250_000) {
    score += 12
  }

  return score
}

function pickBestEntry(entries) {
  return [...entries].sort((left, right) =>
    right.score - left.score
    || right.sourceRank - left.sourceRank
    || left.modelName.localeCompare(right.modelName),
  )[0]
}

function chooseLimit(entries, field) {
  const candidates = entries
    .filter(entry => entry.limits[field])
    .sort((left, right) => right.sourceRank - left.sourceRank || right.score - left.score)

  if (candidates.length === 0) {
    return null
  }

  const bestRank = candidates[0].sourceRank
  const bestRankValues = candidates
    .filter(entry => entry.sourceRank === bestRank)
    .map(entry => entry.limits[field])

  return Math.min(...bestRankValues)
}

function applyTypeLimits(models) {
  const typeLimits = {
    chat: 64,
    embedding: 18,
    rerank: 8,
    image: 4,
    audio: 2,
    video: 4,
  }
  const vendorLimits = {
    chat: 10,
    embedding: 6,
    rerank: 5,
    image: 4,
    audio: 2,
    video: 2,
  }
  const familyLimits = {
    chat: 5,
    embedding: 4,
    rerank: 4,
    image: 3,
    audio: 2,
    video: 2,
  }
  const counts = {}
  const vendorCounts = {}
  const familyCounts = {}
  const result = []

  for (const model of models) {
    const limit = typeLimits[model.modelType] ?? 8
    const count = counts[model.modelType] ?? 0
    if (count >= limit) {
      continue
    }

    const vendorKey = `${model.modelType}:${readVendorKey(model.modelId)}`
    const vendorCount = vendorCounts[vendorKey] ?? 0
    if (vendorCount >= (vendorLimits[model.modelType] ?? 4)) {
      continue
    }

    const familyKey = `${model.modelType}:${readModelFamilyKey(model.modelId)}`
    const familyCount = familyCounts[familyKey] ?? 0
    if (familyCount >= (familyLimits[model.modelType] ?? 3)) {
      continue
    }

    counts[model.modelType] = count + 1
    vendorCounts[vendorKey] = vendorCount + 1
    familyCounts[familyKey] = familyCount + 1
    result.push(model)
  }

  return result
}

function stripInternalQualityScore(model) {
  return {
    modelId: model.modelId,
    modelName: model.modelName,
    modelType: model.modelType,
    inputModalities: model.inputModalities,
    outputModalities: model.outputModalities,
    capabilities: model.capabilities,
    limits: model.limits,
  }
}

function canonicalizeModelId(modelId) {
  const normalized = modelId
    .trim()
    .replace(/^~/, '')
    .replace(/^openrouter\//, '')

  return canonicalizeAnthropicClaudeModelId(normalized) ?? normalized
}

function canonicalizeAnthropicClaudeModelId(modelId) {
  const normalized = modelId.trim().toLowerCase()
  const canonicalModelId = readCanonicalClaudeModelId(normalized)

  return canonicalModelId ? `anthropic/${canonicalModelId}` : null
}

function readCanonicalClaudeModelId(modelId) {
  const familyMinorMatch = modelId.match(/(?:^|[^a-z0-9])claude-(opus|sonnet|haiku)-(\d{1,2})-(\d{1,2})(?:-20\d{6})?(?=$|[^a-z0-9])/)
  if (familyMinorMatch) {
    return `claude-${familyMinorMatch[1]}-${familyMinorMatch[2]}.${familyMinorMatch[3]}`
  }

  const versionMinorMatch = modelId.match(/(?:^|[^a-z0-9])claude-(\d{1,2})-(\d{1,2})-(opus|sonnet|haiku)(?:-20\d{6})?(?=$|[^a-z0-9])/)
  if (versionMinorMatch) {
    return `claude-${versionMinorMatch[1]}.${versionMinorMatch[2]}-${versionMinorMatch[3]}`
  }

  const canonicalMinorMatch = modelId.match(/(?:^|[^a-z0-9])(claude-(?:(?:opus|sonnet|haiku)-\d{1,2}\.\d{1,2}|\d{1,2}\.\d{1,2}-(?:opus|sonnet|haiku)))(?=$|[^a-z0-9])/)
  if (canonicalMinorMatch) {
    return canonicalMinorMatch[1]
  }

  const familyMajorMatch = modelId.match(/(?:^|[^a-z0-9])claude-(opus|sonnet|haiku)-(\d{1,2})(?:-20\d{6})?(?!-\d)(?=$|[^a-z0-9])/)
  if (familyMajorMatch) {
    return `claude-${familyMajorMatch[1]}-${familyMajorMatch[2]}`
  }

  const versionMajorMatch = modelId.match(/(?:^|[^a-z0-9])claude-(\d{1,2})-(opus|sonnet|haiku)(?:-20\d{6})?(?!-\d)(?=$|[^a-z0-9])/)
  if (versionMajorMatch) {
    return `claude-${versionMajorMatch[1]}-${versionMajorMatch[2]}`
  }

  const canonicalMajorMatch = modelId.match(/(?:^|[^a-z0-9])(claude-(?:(?:opus|sonnet|haiku)-\d{1,2}|\d{1,2}-(?:opus|sonnet|haiku)))(?!-\d)(?=$|[^a-z0-9])/)
  return canonicalMajorMatch?.[1] ?? null
}

function normalizeProviderKey(providerKey) {
  return providerKey.trim().toLowerCase().replaceAll('-', '_')
}

function hasUnstableModelId(modelId) {
  const parts = modelId.toLowerCase().split(/[/:._-]+/).filter(Boolean)
  return parts.some(part => UNSTABLE_MODEL_ID_PARTS.has(part))
}

function isLowSignalModelId(modelId) {
  return /^\d{3,4}-x-\d{3,4}\//.test(modelId.toLowerCase())
}

function isRerankModelId(modelId) {
  const normalized = modelId.toLowerCase()
  return normalized.includes('rerank')
    || normalized.startsWith('cross-encoder/')
    || normalized.includes('/cross-encoder')
}

function isPreferredVendor(modelId) {
  const vendor = readVendorKey(modelId)
  return [
    'anthropic',
    'cohere',
    'deepseek',
    'google',
    'jinaai',
    'meta-llama',
    'mistralai',
    'mistral',
    'openai',
    'qwen',
    'voyage',
    'x-ai',
  ].includes(vendor)
}

function scoreModelFreshness(modelId) {
  const normalized = modelId.toLowerCase()
  const versions = [...normalized.matchAll(/(?:^|[/:._-])(?:gpt|claude|gemini|gemma|deepseek|qwen|mistral|llama|glm|grok)[-_.]?(\d+)(?:[._-](\d+))?/g)]
    .map(match => ({
      major: Number.parseInt(match[1] ?? '0', 10),
      minor: Number.parseInt(match[2] ?? '0', 10),
    }))
    .filter(version => Number.isInteger(version.major) && version.major > 0)
  const versionScore = versions.length > 0
    ? Math.max(...versions.map(version => version.major * 100 + version.minor))
    : 0
  const dateScore = [...normalized.matchAll(/(?:^|[/:._-])(20\d{2})(?:[-_.]?([01]\d))?(?:[-_.]?([0-3]\d))?/g)]
    .map((match) => {
      const year = Number.parseInt(match[1] ?? '0', 10)
      const month = Number.parseInt(match[2] ?? '0', 10)
      const day = Number.parseInt(match[3] ?? '0', 10)
      return year * 10000 + month * 100 + day
    })
    .reduce((max, value) => Math.max(max, value), 0)

  return versionScore * 1_000_000 + dateScore
}

function readVendorKey(modelId) {
  return modelId.toLowerCase().split('/')[0] ?? 'unknown'
}

function readModelFamilyKey(modelId) {
  const [vendor = 'unknown', rest = modelId] = modelId.toLowerCase().split('/')
  const tokens = rest
    .split(/[._:-]+/)
    .flatMap(part => part.split('-'))
    .filter(part =>
      part
      && !/^\d+$/.test(part)
      && !/^\d+\.\d+$/.test(part)
      && !UNSTABLE_MODEL_ID_PARTS.has(part)
      && part !== 'fast'
      && part !== 'turbo',
    )

  return `${vendor}/${tokens.slice(0, 2).join('-') || rest}`
}

function inferModelType(input) {
  const modelId = input.modelId.toLowerCase()
  const mode = input.mode?.toLowerCase()
  const pipelineTag = input.pipelineTag?.toLowerCase()
  const sourceType = input.sourceType?.toLowerCase()
  const outputsEmbedding = input.outputModalities.includes('embedding')

  if (isRerankModelId(modelId) || pipelineTag === 'text-ranking') {
    return 'rerank'
  }
  if (outputsEmbedding || mode === 'embedding' || pipelineTag === 'feature-extraction' || pipelineTag === 'sentence-similarity') {
    return 'embedding'
  }
  if (mode === 'image_generation' || pipelineTag === 'text-to-image' || input.outputModalities.includes('image')) {
    return 'image'
  }
  if (mode === 'audio_transcription' || mode === 'audio_speech' || pipelineTag === 'automatic-speech-recognition' || input.outputModalities.includes('audio')) {
    return 'audio'
  }
  if (sourceType?.includes('image') || input.inputModalities.includes('image')) {
    return 'chat'
  }

  return 'chat'
}

function inferDefaultOutputModalities(modelType) {
  if (modelType === 'embedding') {
    return ['embedding']
  }
  if (modelType === 'image') {
    return ['image']
  }
  if (modelType === 'audio') {
    return ['text']
  }

  return ['text']
}

function inferCapabilities(input) {
  const capabilities = []
  const supportedParameters = input.supportedParameters ?? []
  const record = isRecord(input.record) ? input.record : {}
  const tags = input.tags ?? []

  if (supportedParameters.includes('tools') || supportedParameters.includes('tool_choice') || record.supports_function_calling === true) {
    capabilities.push('tool_call')
  }
  if (supportedParameters.includes('response_format') || record.supports_response_schema === true) {
    capabilities.push('json_mode')
  }
  if (supportedParameters.includes('structured_outputs') || record.supports_response_schema === true) {
    capabilities.push('structured_output')
  }
  if (supportedParameters.includes('reasoning') || supportedParameters.includes('include_reasoning') || record.supports_reasoning === true || tags.includes('reasoning')) {
    capabilities.push('reasoning')
  }

  return capabilities
}

function inferProviderKeyFromModelId(modelId) {
  const firstSegment = modelId.split('/')[0]
  return firstSegment && firstSegment !== modelId ? normalizeProviderKey(firstSegment) : 'unknown'
}

function normalizeModalities(values) {
  const normalized = []

  for (const value of values) {
    const item = value.toLowerCase()
    if (item.includes('text')) {
      normalized.push('text')
    }
    if (item.includes('image') || item.includes('vision')) {
      normalized.push('image')
    }
    if (item.includes('audio') || item.includes('speech')) {
      normalized.push('audio')
    }
    if (item.includes('video')) {
      normalized.push('video')
    }
    if (item.includes('file') || item.includes('pdf')) {
      normalized.push('file')
    }
    if (item.includes('embedding')) {
      normalized.push('embedding')
    }
  }

  return uniqueStrings(normalized)
}

function inferHuggingFaceInputModalities(pipelineTag, tags) {
  const values = [pipelineTag, ...tags].filter(Boolean)
  const modalities = normalizeModalities(values)

  if (pipelineTag === 'text-to-image') {
    return ['text']
  }
  if (pipelineTag === 'image-to-text' || pipelineTag === 'visual-question-answering') {
    return uniqueStrings([...modalities, 'image'])
  }
  if (pipelineTag === 'automatic-speech-recognition') {
    return ['audio']
  }
  if (pipelineTag === 'text-to-speech' || pipelineTag === 'text-to-audio') {
    return ['text']
  }

  return modalities.length > 0 ? modalities : ['text']
}

function inferHuggingFaceOutputModalities(pipelineTag, tags) {
  if (pipelineTag === 'text-to-image') {
    return ['image']
  }
  if (pipelineTag === 'feature-extraction' || pipelineTag === 'sentence-similarity') {
    return ['embedding']
  }
  if (pipelineTag === 'automatic-speech-recognition') {
    return ['text']
  }
  if (pipelineTag === 'text-to-speech' || pipelineTag === 'text-to-audio') {
    return ['audio']
  }

  const modalities = normalizeModalities(tags)
  return modalities.includes('embedding') ? ['embedding'] : ['text']
}

function inferContextWindowFromConfig(config) {
  return getPositiveInteger(config.max_position_embeddings)
    ?? getPositiveInteger(config.n_positions)
    ?? getPositiveInteger(config.seq_length)
    ?? getPositiveInteger(config.model_max_length)
    ?? getPositiveInteger(config.max_sequence_length)
    ?? null
}

function groupBy(items, readKey) {
  const groups = new Map()

  for (const item of items) {
    const key = readKey(item)
    const group = groups.get(key) ?? []
    group.push(item)
    groups.set(key, group)
  }

  return groups
}

function sortFinalModels(models) {
  return [...models].sort((left, right) =>
    right.quality.score - left.quality.score
    || right.quality.freshness - left.quality.freshness
    || left.modelType.localeCompare(right.modelType)
    || left.modelId.localeCompare(right.modelId),
  )
}

function confidenceFromScore(score) {
  if (score >= 145) {
    return 'high'
  }
  if (score >= 105) {
    return 'medium'
  }

  return 'low'
}

function buildNormalizedSummary(entries) {
  const summary = {
    total: entries.length,
    bySource: {},
    byType: {},
    withContextWindow: 0,
    withMaxOutputTokens: 0,
    withToolCall: 0,
    withImageInput: 0,
    withStructuredOutput: 0,
  }

  for (const entry of entries) {
    increment(summary.bySource, entry.source)
    increment(summary.byType, entry.modelType)

    if (entry.limits.contextWindow) {
      summary.withContextWindow += 1
    }
    if (entry.limits.maxOutputTokens) {
      summary.withMaxOutputTokens += 1
    }
    if (entry.capabilities.includes('tool_call')) {
      summary.withToolCall += 1
    }
    if (entry.inputModalities.includes('image')) {
      summary.withImageInput += 1
    }
    if (entry.capabilities.includes('structured_output')) {
      summary.withStructuredOutput += 1
    }
  }

  return summary
}

function buildFinalSummary(models) {
  const summary = {
    total: models.length,
    byType: {},
    withContextWindow: 0,
    withMaxOutputTokens: 0,
    withToolCall: 0,
    withImageInput: 0,
    withStructuredOutput: 0,
  }

  for (const model of models) {
    increment(summary.byType, model.modelType)

    if (model.limits.contextWindow) {
      summary.withContextWindow += 1
    }
    if (model.limits.maxOutputTokens) {
      summary.withMaxOutputTokens += 1
    }
    if (model.capabilities.includes('tool_call')) {
      summary.withToolCall += 1
    }
    if (model.inputModalities.includes('image')) {
      summary.withImageInput += 1
    }
    if (model.capabilities.includes('structured_output')) {
      summary.withStructuredOutput += 1
    }
  }

  return summary
}

function printSummary(defaults, report, outputPath, cacheDir) {
  console.log(`Wrote ${defaults.models.length} curated model defaults to ${path.relative(REPO_ROOT, outputPath)}`)
  console.log(`Cache: ${path.relative(REPO_ROOT, cacheDir)}`)
  console.log(`Sources: ${report.sources.map(source => `${source.key}:${source.status}:${source.rawCount}`).join(', ')}`)
  console.log(`Normalized: ${report.normalizedSummary.total}, final: ${report.finalSummary.total}, excluded: ${report.excluded.length}, conflicts: ${report.conflicts.length}`)
  console.log(`Types: ${Object.entries(report.finalSummary.byType).map(([key, value]) => `${key}:${value}`).join(', ')}`)
  console.log(`Limits: contextWindow=${report.finalSummary.withContextWindow}, maxOutputTokens=${report.finalSummary.withMaxOutputTokens}`)
  console.log(`Capabilities: tool_call=${report.finalSummary.withToolCall}, structured_output=${report.finalSummary.withStructuredOutput}`)
  console.log(`Modalities: image_input=${report.finalSummary.withImageInput}`)
  console.log('Sample:')

  for (const model of defaults.models.slice(0, 10)) {
    console.log(`- ${model.modelId} type=${model.modelType} in=${model.inputModalities.join('+')} out=${model.outputModalities.join('+')} ctx=${model.limits.contextWindow ?? 'n/a'} outMax=${model.limits.maxOutputTokens ?? 'n/a'} caps=${model.capabilities.join('+') || 'none'}`)
  }
}

function increment(record, key) {
  record[key] = (record[key] ?? 0) + 1
}

function isRecord(value) {
  return typeof value === 'object' && value !== null
}

function getString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getStringArray(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim()) : []
}

function getPositiveInteger(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number.parseInt(value, 10)
  }

  return null
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))]
}
