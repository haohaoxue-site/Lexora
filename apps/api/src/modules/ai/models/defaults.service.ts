import type {
  AiAvailableModelOption,
  AiAvailableProviderOption,
  AiDefaultModelPolicyItem,
  AiModelIntentKey,
  AiProviderScope,
  UpdateAiDefaultModelPolicyRequest,
} from '@haohaoxue/samepage-contracts'
import type {
  AiProvider,
  AiProviderModel,
} from '@prisma/client'
import {
  AI_DEFAULT_MODEL_STATUS,
  AI_MODEL_INTENT_KEY_VALUES,
  AiModelIntentKeySchema,
  AiProviderScopeSchema,
} from '@haohaoxue/samepage-contracts'
import { isAiModelCapabilitySatisfied } from '@haohaoxue/samepage-shared'
import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../../database/prisma.service'
import {
  buildAiModelRef,
  toAvailableModelOption,
  toAvailableProviderOption,
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
    if (!payload.modelRef) {
      return this.clearDefaultModelPolicy(userId, parsedIntentKey)
    }

    const provider = await this.prisma.aiProvider.findFirst({
      where: {
        id: payload.modelRef.providerId,
        enabled: true,
        OR: [
          { scope: 'PLATFORM', visibility: 'ALL_USERS' },
          { scope: 'USER', ownerUserId: userId },
        ],
      },
    })

    if (!provider) {
      throw new BadRequestException('服务商不可用')
    }

    const model = await this.prisma.aiProviderModel.findFirst({
      where: {
        providerId: payload.modelRef.providerId,
        modelId: payload.modelRef.modelId,
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
        providerId: payload.modelRef.providerId,
        modelId: payload.modelRef.modelId,
        updatedBy: userId,
        deletedAt: null,
      },
      update: {
        providerId: payload.modelRef.providerId,
        modelId: payload.modelRef.modelId,
        updatedBy: userId,
        deletedAt: null,
      },
    })

    return toDefaultModelPolicyItem({
      intentKey: parsedIntentKey,
      modelRef: buildAiModelRef({
        providerId: provider.id,
        scope: provider.scope,
        providerKey: provider.providerKey,
        modelId: policy.modelId,
      }),
      status: AI_DEFAULT_MODEL_STATUS.READY,
      invalidReason: null,
      updatedAt: policy.updatedAt,
    })
  }

  private async clearDefaultModelPolicy(userId: string, intentKey: AiModelIntentKey): Promise<AiDefaultModelPolicyItem> {
    const policy = await this.prisma.aiDefaultModelPolicy.findUnique({
      where: {
        userId_intentKey: {
          userId,
          intentKey,
        },
      },
    })

    if (policy) {
      await this.prisma.aiDefaultModelPolicy.delete({
        where: {
          userId_intentKey: {
            userId,
            intentKey,
          },
        },
      })
    }

    return this.getDefaultModelItem(userId, intentKey)
  }

  async getAvailableModels(userId: string, intentKey: AiModelIntentKey): Promise<AiAvailableModelOption[]> {
    const parsedIntentKey = AiModelIntentKeySchema.parse(intentKey)
    const providers = await this.prisma.aiProvider.findMany({
      where: {
        enabled: true,
        OR: [
          { scope: 'PLATFORM', visibility: 'ALL_USERS' },
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

    return providers.flatMap(provider =>
      provider.models.map(model => this.toAvailableModelOptionForIntent(provider, model, parsedIntentKey)),
    )
  }

  async getAvailableProviders(
    userId: string,
    intentKey: AiModelIntentKey,
    scope: AiProviderScope,
  ): Promise<AiAvailableProviderOption[]> {
    AiModelIntentKeySchema.parse(intentKey)
    const parsedScope = AiProviderScopeSchema.parse(scope)
    const providers = await this.prisma.aiProvider.findMany({
      where: {
        enabled: true,
        scope: toPrismaScope(parsedScope),
        OR: [
          { scope: 'PLATFORM', visibility: 'ALL_USERS' },
          { scope: 'USER', ownerUserId: userId },
        ],
        models: {
          some: { enabled: true },
        },
      },
      orderBy: { providerName: 'asc' },
    })

    return providers.map(toAvailableProviderOption)
  }

  async getAvailableProviderModels(
    userId: string,
    intentKey: AiModelIntentKey,
    providerId: string,
  ): Promise<AiAvailableModelOption[]> {
    const parsedIntentKey = AiModelIntentKeySchema.parse(intentKey)
    const provider = await this.prisma.aiProvider.findFirst({
      where: {
        id: providerId,
        enabled: true,
        OR: [
          { scope: 'PLATFORM', visibility: 'ALL_USERS' },
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

    if (!provider) {
      return []
    }

    return provider.models.map(model => this.toAvailableModelOptionForIntent(provider, model, parsedIntentKey))
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

    const provider = await this.prisma.aiProvider.findFirst({
      where: {
        id: policy.providerId,
        enabled: true,
        OR: [
          { scope: 'PLATFORM', visibility: 'ALL_USERS' },
          { scope: 'USER', ownerUserId: userId },
        ],
      },
    })

    if (!provider) {
      return this.invalidPolicy(intentKey, policy.updatedAt, '服务商不可用')
    }

    const model = await this.prisma.aiProviderModel.findFirst({
      where: {
        providerId: policy.providerId,
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
        providerId: provider.id,
        scope: provider.scope,
        providerKey: provider.providerKey,
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
    provider: AiProvider,
    model: AiProviderModel,
    intentKey: AiModelIntentKey,
  ): AiAvailableModelOption {
    const selectable = isAiModelCapabilitySatisfied({
      modelType: toDomainModelType(model.modelType),
      capabilities: model.capabilities.map(toDomainCapability),
    }, intentKey)

    return toAvailableModelOption({
      provider,
      model,
      selectable,
      unavailableReason: selectable ? null : '模型不满足当前场景要求',
    })
  }
}
