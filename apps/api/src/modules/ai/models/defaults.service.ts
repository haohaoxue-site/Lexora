import type {
  AiAvailableModelOption,
  AiAvailableModelServiceOption,
  AiDefaultModelPolicyItem,
  AiModelIntentKey,
  AiModelServiceScope,
  UpdateAiDefaultModelPolicyRequest,
} from '@haohaoxue/samepage-contracts'
import type {
  AiModelItem,
  AiModelServiceConfig,
} from '@prisma/client'
import {
  AI_DEFAULT_MODEL_STATUS,
  AI_MODEL_INTENT_KEY_VALUES,
  AiModelIntentKeySchema,
  AiModelServiceScopeSchema,
} from '@haohaoxue/samepage-contracts'
import { isAiModelCapabilitySatisfied } from '@haohaoxue/samepage-shared'
import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../../database/prisma.service'
import {
  buildAiModelRef,
  toAvailableModelOption,
  toAvailableModelServiceOption,
  toDefaultModelPolicyItem,
  toDomainCapability,
  toDomainModelType,
  toPrismaScope,
} from '../ai.utils'

@Injectable()
export class AiDefaultModelsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDefaultModels(userId: string): Promise<AiDefaultModelPolicyItem[]> {
    return Promise.all(AI_MODEL_INTENT_KEY_VALUES.map(intentKey => this.getDefaultModelItem(userId, intentKey)))
  }

  async updateDefaultModel(
    userId: string,
    intentKey: AiModelIntentKey,
    payload: UpdateAiDefaultModelPolicyRequest,
  ): Promise<AiDefaultModelPolicyItem> {
    const parsedIntentKey = AiModelIntentKeySchema.parse(intentKey)
    const service = await this.prisma.aiModelServiceConfig.findFirst({
      where: {
        id: payload.configId,
        enabled: true,
        OR: [
          { scope: 'SYSTEM', visibility: 'ALL_USERS' },
          { scope: 'USER', ownerUserId: userId },
        ],
      },
    })

    if (!service) {
      throw new BadRequestException('模型服务不可用')
    }

    const model = await this.prisma.aiModelItem.findFirst({
      where: {
        serviceConfigId: payload.configId,
        modelId: payload.modelId,
        enabled: true,
      },
    })

    if (!model) {
      throw new BadRequestException('模型不可用')
    }

    if (!isAiModelCapabilitySatisfied({
      modelType: toDomainModelType(model.modelType),
      capabilities: model.capabilities.map(toDomainCapability),
    }, parsedIntentKey)) {
      throw new BadRequestException('模型不满足当前场景要求')
    }

    const policy = await this.prisma.$bypass.aiDefaultModelPolicy.upsert({
      where: {
        userId_intentKey: {
          userId,
          intentKey: parsedIntentKey,
        },
      },
      create: {
        userId,
        intentKey: parsedIntentKey,
        serviceConfigId: payload.configId,
        modelId: payload.modelId,
        updatedBy: userId,
        deletedAt: null,
      },
      update: {
        serviceConfigId: payload.configId,
        modelId: payload.modelId,
        updatedBy: userId,
        deletedAt: null,
      },
    })

    return toDefaultModelPolicyItem({
      intentKey: parsedIntentKey,
      modelRef: buildAiModelRef({
        configId: service.id,
        scope: service.scope,
        providerKey: service.providerKey,
        modelId: policy.modelId,
      }),
      status: AI_DEFAULT_MODEL_STATUS.READY,
      invalidReason: null,
      updatedAt: policy.updatedAt,
    })
  }

  async getAvailableModels(userId: string, intentKey: AiModelIntentKey): Promise<AiAvailableModelOption[]> {
    const parsedIntentKey = AiModelIntentKeySchema.parse(intentKey)
    const services = await this.prisma.aiModelServiceConfig.findMany({
      where: {
        enabled: true,
        OR: [
          { scope: 'SYSTEM', visibility: 'ALL_USERS' },
          { scope: 'USER', ownerUserId: userId },
        ],
      },
      include: {
        models: {
          where: { enabled: true },
          orderBy: { modelName: 'asc' },
        },
      },
      orderBy: [
        { scope: 'asc' },
        { providerName: 'asc' },
      ],
    })

    return services.flatMap(service =>
      service.models.map(model => this.toAvailableModelOptionForIntent(service, model, parsedIntentKey)),
    )
  }

  async getAvailableModelServices(
    userId: string,
    intentKey: AiModelIntentKey,
    scope: AiModelServiceScope,
  ): Promise<AiAvailableModelServiceOption[]> {
    AiModelIntentKeySchema.parse(intentKey)
    const parsedScope = AiModelServiceScopeSchema.parse(scope)
    const services = await this.prisma.aiModelServiceConfig.findMany({
      where: {
        enabled: true,
        scope: toPrismaScope(parsedScope),
        OR: [
          { scope: 'SYSTEM', visibility: 'ALL_USERS' },
          { scope: 'USER', ownerUserId: userId },
        ],
        models: {
          some: { enabled: true },
        },
      },
      orderBy: { providerName: 'asc' },
    })

    return services.map(toAvailableModelServiceOption)
  }

  async getAvailableServiceModels(
    userId: string,
    intentKey: AiModelIntentKey,
    configId: string,
  ): Promise<AiAvailableModelOption[]> {
    const parsedIntentKey = AiModelIntentKeySchema.parse(intentKey)
    const service = await this.prisma.aiModelServiceConfig.findFirst({
      where: {
        id: configId,
        enabled: true,
        OR: [
          { scope: 'SYSTEM', visibility: 'ALL_USERS' },
          { scope: 'USER', ownerUserId: userId },
        ],
      },
      include: {
        models: {
          where: { enabled: true },
          orderBy: { modelName: 'asc' },
        },
      },
    })

    if (!service) {
      throw new BadRequestException('模型服务不可用')
    }

    return service.models.map(model => this.toAvailableModelOptionForIntent(service, model, parsedIntentKey))
  }

  private async getDefaultModelItem(userId: string, intentKey: AiModelIntentKey): Promise<AiDefaultModelPolicyItem> {
    const policy = await this.prisma.aiDefaultModelPolicy.findUnique({
      where: {
        userId_intentKey: {
          userId,
          intentKey,
        },
      },
    })

    if (!policy) {
      return toDefaultModelPolicyItem({
        intentKey,
        modelRef: null,
        status: AI_DEFAULT_MODEL_STATUS.NOT_CONFIGURED,
        invalidReason: null,
        updatedAt: null,
      })
    }

    const service = await this.prisma.aiModelServiceConfig.findFirst({
      where: {
        id: policy.serviceConfigId,
        enabled: true,
        OR: [
          { scope: 'SYSTEM', visibility: 'ALL_USERS' },
          { scope: 'USER', ownerUserId: userId },
        ],
      },
    })

    if (!service) {
      return this.invalidPolicy(intentKey, policy.updatedAt, '模型服务不可用')
    }

    const model = await this.prisma.aiModelItem.findFirst({
      where: {
        serviceConfigId: policy.serviceConfigId,
        modelId: policy.modelId,
        enabled: true,
      },
    })

    if (!model) {
      return this.invalidPolicy(intentKey, policy.updatedAt, '模型不可用')
    }

    if (!isAiModelCapabilitySatisfied({
      modelType: toDomainModelType(model.modelType),
      capabilities: model.capabilities.map(toDomainCapability),
    }, intentKey)) {
      return this.invalidPolicy(intentKey, policy.updatedAt, '模型不满足当前场景要求')
    }

    return toDefaultModelPolicyItem({
      intentKey,
      modelRef: buildAiModelRef({
        configId: service.id,
        scope: service.scope,
        providerKey: service.providerKey,
        modelId: policy.modelId,
      }),
      status: AI_DEFAULT_MODEL_STATUS.READY,
      invalidReason: null,
      updatedAt: policy.updatedAt,
    })
  }

  private invalidPolicy(intentKey: AiModelIntentKey, updatedAt: Date, invalidReason: string): AiDefaultModelPolicyItem {
    return toDefaultModelPolicyItem({
      intentKey,
      modelRef: null,
      status: AI_DEFAULT_MODEL_STATUS.INVALID,
      invalidReason,
      updatedAt,
    })
  }

  private toAvailableModelOptionForIntent(
    service: AiModelServiceConfig,
    model: AiModelItem,
    intentKey: AiModelIntentKey,
  ): AiAvailableModelOption {
    const selectable = isAiModelCapabilitySatisfied({
      modelType: toDomainModelType(model.modelType),
      capabilities: model.capabilities.map(toDomainCapability),
    }, intentKey)

    return toAvailableModelOption({
      service,
      model,
      selectable,
      unavailableReason: selectable ? null : '模型不满足当前场景要求',
    })
  }
}
