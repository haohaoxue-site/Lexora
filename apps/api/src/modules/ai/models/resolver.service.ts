import type { AiModelIntentKey, AiModelRef } from '@haohaoxue/samepage-contracts'
import { AiModelIntentKeySchema } from '@haohaoxue/samepage-contracts'
import { getAiModelIntentFallbackChain, isAiModelCapabilitySatisfied, normalizeAiEndpoint } from '@haohaoxue/samepage-shared'
import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../../database/prisma.service'
import {
  toDomainAuthMode,
  toDomainCapability,
  toDomainModelType,
  toDomainScope,
} from '../ai.utils'
import { AiProviderAdaptersService } from '../providers/adapters.service'

export interface ResolveAiModelTargetParams {
  actorUserId: string
  intentKey: AiModelIntentKey
  requestedModelRef?: Pick<AiModelRef, 'configId' | 'modelId'> | null
}

export interface ResolvedAiModelTarget {
  configId: string
  scope: 'system' | 'user'
  providerKey: string
  providerName: string
  adapterKey: string
  endpoint: string
  apiKey: string | null
  authMode: 'api-key' | 'bearer' | 'none'
  modelId: string
  modelName: string
}

@Injectable()
export class AiModelResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adaptersService: AiProviderAdaptersService,
  ) {}

  async resolveModelTarget(params: ResolveAiModelTargetParams): Promise<ResolvedAiModelTarget> {
    const intentKey = AiModelIntentKeySchema.parse(params.intentKey)
    const modelRef = await this.resolveRequestedModelRef(params.actorUserId, intentKey, params.requestedModelRef)
    const service = await this.prisma.aiModelServiceConfig.findFirst({
      where: {
        id: modelRef.configId,
        enabled: true,
        OR: [
          { scope: 'SYSTEM', visibility: 'ALL_USERS' },
          { scope: 'USER', ownerUserId: params.actorUserId },
        ],
      },
    })

    if (!service) {
      throw new BadRequestException('模型服务不可用')
    }

    const model = await this.prisma.aiModelItem.findFirst({
      where: {
        serviceConfigId: modelRef.configId,
        modelId: modelRef.modelId,
        enabled: true,
      },
    })

    if (!model) {
      throw new BadRequestException('模型不可用')
    }

    if (!isAiModelCapabilitySatisfied({
      modelType: toDomainModelType(model.modelType),
      capabilities: model.capabilities.map(toDomainCapability),
    }, intentKey)) {
      throw new BadRequestException('模型不满足当前场景要求')
    }

    const endpoint = service.endpoint?.trim()
    if (!endpoint) {
      throw new BadRequestException('模型服务未配置 API 地址')
    }

    const apiKey = this.adaptersService.decryptApiKey(service.apiKeyEncrypted)
    if (service.authMode !== 'NONE' && !apiKey) {
      throw new BadRequestException('模型服务未配置 API Key')
    }

    return {
      configId: service.id,
      scope: toDomainScope(service.scope),
      providerKey: service.providerKey,
      providerName: service.providerName,
      adapterKey: service.adapterKey,
      endpoint: normalizeAiEndpoint(endpoint),
      apiKey,
      authMode: toDomainAuthMode(service.authMode),
      modelId: model.modelId,
      modelName: model.modelName,
    }
  }

  private async resolveRequestedModelRef(
    actorUserId: string,
    intentKey: AiModelIntentKey,
    requestedModelRef: Pick<AiModelRef, 'configId' | 'modelId'> | null | undefined,
  ) {
    if (requestedModelRef) {
      return requestedModelRef
    }

    return this.resolveDefaultModelRef(actorUserId, intentKey)
  }

  private async resolveDefaultModelRef(actorUserId: string, intentKey: AiModelIntentKey) {
    const intentFallbackChain = getAiModelIntentFallbackChain(intentKey)
    const policies = await this.prisma.aiDefaultModelPolicy.findMany({
      where: {
        userId: actorUserId,
        intentKey: { in: intentFallbackChain },
      },
    })
    const policyByIntentKey = new Map(policies.map(policy => [policy.intentKey, policy]))

    for (const currentIntentKey of intentFallbackChain) {
      const policy = policyByIntentKey.get(currentIntentKey)

      if (policy) {
        return {
          configId: policy.serviceConfigId,
          modelId: policy.modelId,
        }
      }
    }

    throw new BadRequestException('请先配置默认模型')
  }
}
