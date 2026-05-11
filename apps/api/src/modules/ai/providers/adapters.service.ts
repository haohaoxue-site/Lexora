import type { AiModelType } from '@haohaoxue/samepage-contracts'
import type { AiProvider } from '@prisma/client'
import type { CryptoConfig } from '../../../config/auth.config'
import { AI_MODEL_TYPE } from '@haohaoxue/samepage-contracts'
import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { decryptAes256Gcm, encryptAes256Gcm, isEncryptedValue } from '../../../utils/crypto'

const MODEL_LIST_TIMEOUT_MS = 15_000
const TRAILING_SLASHES_RE = /\/+$/

interface ProviderModelRecord {
  modelId: string
  modelName: string
  modelType: AiModelType
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

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), MODEL_LIST_TIMEOUT_MS)

    try {
      const response = await fetch(`${endpoint.replace(TRAILING_SLASHES_RE, '')}/models`, {
        method: 'GET',
        headers: this.buildModelListHeaders(provider.authMode, apiKey),
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

    return {
      modelId,
      modelName: label,
      modelType: inferProviderModelType(modelId),
      contextWindow: getNumber(properties.context_size) ?? getNumber(record.context_window) ?? null,
      maxOutputTokens: getNumber(properties.max_output_tokens) ?? getNumber(record.max_output_tokens) ?? null,
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
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
