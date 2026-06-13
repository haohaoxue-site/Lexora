import type { AiModelCapability, AiModelModality, AiModelType } from '@haohaoxue/lexora-contracts'
import type { AiProvider } from '@prisma/client'
import type { CryptoConfig } from '../../../config/auth.config'
import { AI_MODEL_CAPABILITY, AI_MODEL_MODALITY, AI_MODEL_TYPE } from '@haohaoxue/lexora-contracts'
import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { decryptAes256Gcm, encryptAes256Gcm, isEncryptedValue } from '../../../utils/crypto'

const MODEL_LIST_TIMEOUT_MS = 15_000
const TRAILING_SLASHES_RE = /\/+$/

export interface ProviderModelRecord {
  modelId: string
  modelName: string
  modelType: AiModelType
  inputModalities: AiModelModality[]
  outputModalities: AiModelModality[]
  capabilities: AiModelCapability[]
  contextWindow: number | null
  maxOutputTokens: number | null
}

@Injectable()
export class AiProviderAdaptersService {
  private readonly encryptionKey: string

  constructor(configService: ConfigService) {
    this.encryptionKey = configService.getOrThrow<CryptoConfig>('crypto').encryptionKey
  }

  encryptApiKey(apiKey: string): string {
    return encryptAes256Gcm(apiKey, this.encryptionKey)
  }

  decryptApiKey(apiKeyEncrypted: string | null): string | null {
    if (!apiKeyEncrypted) {
      return null
    }

    if (!isEncryptedValue(apiKeyEncrypted)) {
      return apiKeyEncrypted
    }

    return decryptAes256Gcm(apiKeyEncrypted, this.encryptionKey)
  }

  async fetchProviderModels(provider: AiProvider): Promise<ProviderModelRecord[]> {
    const endpoint = provider.endpoint?.trim()
    if (!endpoint) {
      throw new BadRequestException('请先配置 API 地址')
    }

    const apiKey = this.decryptApiKey(provider.apiKeyEncrypted)
    if (provider.authMode !== 'NONE' && !apiKey) {
      throw new BadRequestException('请先配置 API Key')
    }

    const headers = this.buildModelListHeaders(provider.authMode, apiKey)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), MODEL_LIST_TIMEOUT_MS)

    try {
      const response = await fetch(`${endpoint.replace(TRAILING_SLASHES_RE, '')}/models`, {
        method: 'GET',
        headers,
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new BadRequestException(`获取模型列表失败：HTTP ${response.status}`)
      }

      const payload = await response.json().catch(() => null)
      const models = this.parseModelListPayload(payload)
      if (models.length === 0) {
        throw new BadRequestException('服务商没有返回可识别的模型列表')
      }

      return models
    }
    catch (error) {
      if (error instanceof BadRequestException) {
        throw error
      }

      throw new BadRequestException('获取模型列表失败，请检查 API 地址和密钥')
    }
    finally {
      clearTimeout(timeout)
    }
  }

  private buildModelListHeaders(authMode: AiProvider['authMode'], apiKey: string | null) {
    const headers: Record<string, string> = {
      accept: 'application/json',
    }

    if (authMode === 'BEARER' && apiKey) {
      headers.authorization = `Bearer ${apiKey}`
    }
    if (authMode === 'API_KEY' && apiKey) {
      headers['x-api-key'] = apiKey
      headers['anthropic-version'] = '2023-06-01'
    }

    return headers
  }

  private parseModelListPayload(payload: unknown): ProviderModelRecord[] {
    const records = this.getModelRecords(payload)
    const seenModelIds = new Set<string>()
    const models: ProviderModelRecord[] = []

    for (const record of records) {
      const model = this.normalizeModelRecord(record)
      if (!model || seenModelIds.has(model.modelId)) {
        continue
      }

      seenModelIds.add(model.modelId)
      models.push(model)
    }

    return models
  }

  private getModelRecords(payload: unknown): Record<string, unknown>[] {
    if (Array.isArray(payload)) {
      return payload.filter(isRecord)
    }
    if (!isRecord(payload)) {
      return []
    }

    const data = payload.data
    if (Array.isArray(data)) {
      return data.filter(isRecord)
    }

    const models = payload.models
    if (Array.isArray(models)) {
      return models.filter(isRecord)
    }

    return []
  }

  private normalizeModelRecord(record: Record<string, unknown>): ProviderModelRecord | null {
    const modelId = getString(record.id) ?? getString(record.model)
    if (!modelId) {
      return null
    }

    const label = getString(record.name)
      ?? getLocalizedLabel(record.label)
      ?? modelId
    const properties = isRecord(record.model_properties) ? record.model_properties : {}
    const architecture = isRecord(record.architecture) ? record.architecture : {}
    const modelType = inferProviderModelType(modelId)
    const inputModalities = normalizeModalities([
      ...getStringArray(record.input_modalities),
      ...getStringArray(properties.input_modalities),
      ...getStringArray(architecture.input_modalities),
      ...(record.supports_vision === true ? [AI_MODEL_MODALITY.IMAGE] : []),
    ])
    const outputModalities = normalizeModalities([
      ...getStringArray(record.output_modalities),
      ...getStringArray(properties.output_modalities),
      ...getStringArray(architecture.output_modalities),
    ])

    return {
      modelId,
      modelName: label,
      modelType,
      inputModalities,
      outputModalities,
      capabilities: inferModelCapabilities(record),
      contextWindow: getNumber(properties.context_size)
        ?? getNumber(properties.context_length)
        ?? getNumber(record.context_window)
        ?? getNumber(record.context_length)
        ?? null,
      maxOutputTokens: getNumber(properties.max_output_tokens)
        ?? getNumber(properties.max_output_length)
        ?? getNumber(record.max_output_tokens)
        ?? getNumber(record.max_output_length)
        ?? null,
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getStringArray(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.split(/[,\s]+/).map(item => item.trim()).filter(Boolean)
  }

  return Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim()) : []
}

function getNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null
  }
  if (typeof value === 'string' && value.trim()) {
    const numericValue = Number(value)
    return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null
  }

  return null
}

function getLocalizedLabel(value: unknown): string | null {
  if (typeof value === 'string') {
    return getString(value)
  }
  if (!isRecord(value)) {
    return null
  }

  return getString(value.zh_Hans) ?? getString(value.en_US)
}

export function inferProviderModelType(modelId: string): AiModelType {
  const normalizedModelId = modelId.toLowerCase()
  if (normalizedModelId.includes('audio') || normalizedModelId.includes('whisper') || normalizedModelId.includes('tts')) {
    return AI_MODEL_TYPE.AUDIO
  }
  if (normalizedModelId.includes('embedding') || normalizedModelId.includes('embed')) {
    return AI_MODEL_TYPE.EMBEDDING
  }
  if (normalizedModelId.includes('rerank')) {
    return AI_MODEL_TYPE.RERANK
  }
  if (normalizedModelId.includes('image') || normalizedModelId.includes('dall-e')) {
    return AI_MODEL_TYPE.IMAGE
  }

  return AI_MODEL_TYPE.CHAT
}

function normalizeModalities(values: string[]): AiModelModality[] {
  const modalities: AiModelModality[] = []

  for (const value of values) {
    const item = value.toLowerCase()
    if (item.includes('text')) {
      modalities.push(AI_MODEL_MODALITY.TEXT)
    }
    if (item.includes('image') || item.includes('vision')) {
      modalities.push(AI_MODEL_MODALITY.IMAGE)
    }
    if (item.includes('audio') || item.includes('speech')) {
      modalities.push(AI_MODEL_MODALITY.AUDIO)
    }
    if (item.includes('video')) {
      modalities.push(AI_MODEL_MODALITY.VIDEO)
    }
    if (item.includes('file') || item.includes('pdf')) {
      modalities.push(AI_MODEL_MODALITY.FILE)
    }
    if (item.includes('embedding')) {
      modalities.push(AI_MODEL_MODALITY.EMBEDDING)
    }
  }

  return [...new Set(modalities)]
}

function inferModelCapabilities(record: Record<string, unknown>): AiModelCapability[] {
  const supportedParameters = [
    ...getStringArray(record.supported_parameters),
    ...getStringArray(record.supported_features),
  ]
  const capabilities: AiModelCapability[] = []

  if (supportedParameters.includes('tools') || supportedParameters.includes('tool_choice') || record.supports_function_calling === true) {
    capabilities.push(AI_MODEL_CAPABILITY.TOOL_CALL)
  }
  if (supportedParameters.includes('response_format') || supportedParameters.includes('json_mode') || record.supports_response_schema === true) {
    capabilities.push(AI_MODEL_CAPABILITY.JSON_MODE)
  }
  if (supportedParameters.includes('structured_outputs') || supportedParameters.includes('structured_output') || record.supports_response_schema === true) {
    capabilities.push(AI_MODEL_CAPABILITY.STRUCTURED_OUTPUT)
  }
  if (supportedParameters.includes('reasoning') || supportedParameters.includes('include_reasoning') || record.supports_reasoning === true) {
    capabilities.push(AI_MODEL_CAPABILITY.REASONING)
  }

  return [...new Set(capabilities)]
}
