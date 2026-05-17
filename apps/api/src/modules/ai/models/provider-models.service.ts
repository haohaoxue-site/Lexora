import type { AiProviderModelItem, AiProviderModels } from '@haohaoxue/samepage-contracts'
import type { AiProvider } from '@prisma/client'
import type {
  UpsertAiProviderModelDto,
  UpsertAiProviderModelsDto,
} from '../ai.dto'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../database/prisma.service'
import {
  toDomainCapability,
  toDomainModelType,
  toPrismaCapability,
  toPrismaModelType,
  toProviderModelItem,
} from '../ai.utils'
import { AiProviderAdaptersService, inferProviderModelType } from '../providers/adapters.service'

type ProviderModelCandidate = Omit<AiProviderModelItem, 'enabled' | 'updatedAt'>

@Injectable()
export class AiProviderModelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adaptersService: AiProviderAdaptersService,
  ) {}

  async getPlatformModels(providerId: string): Promise<AiProviderModels> {
    await this.assertPlatformProvider(providerId)
    return {
      models: await this.getModels(providerId),
    }
  }

  async getUserModels(userId: string, providerId: string): Promise<AiProviderModels> {
    await this.assertUserProvider(userId, providerId)
    return {
      models: await this.getModels(providerId),
    }
  }

  async discoverPlatformProviderModels(providerId: string): Promise<AiProviderModels> {
    const provider = await this.assertPlatformProvider(providerId)
    return this.discoverProviderModels(provider)
  }

  async discoverUserProviderModels(userId: string, providerId: string): Promise<AiProviderModels> {
    const provider = await this.assertUserProvider(userId, providerId)
    return this.discoverProviderModels(provider)
  }

  async upsertPlatformModel(providerId: string, payload: UpsertAiProviderModelDto): Promise<AiProviderModelItem> {
    await this.assertPlatformProvider(providerId)
    return this.upsertModel(providerId, payload)
  }

  async upsertUserModel(userId: string, providerId: string, payload: UpsertAiProviderModelDto): Promise<AiProviderModelItem> {
    await this.assertUserProvider(userId, providerId)
    return this.upsertModel(providerId, payload)
  }

  async upsertPlatformModels(providerId: string, payload: UpsertAiProviderModelsDto): Promise<AiProviderModels> {
    await this.assertPlatformProvider(providerId)
    return this.upsertModels(providerId, payload)
  }

  async upsertUserModels(userId: string, providerId: string, payload: UpsertAiProviderModelsDto): Promise<AiProviderModels> {
    await this.assertUserProvider(userId, providerId)
    return this.upsertModels(providerId, payload)
  }

  private async getModels(providerId: string) {
    const models = await this.prisma.aiProviderModel.findMany({
      where: { providerId },
      orderBy: [
        { modelType: 'asc' },
        { modelName: 'asc' },
      ],
    })

    return models.map(toProviderModelItem)
  }

  private async discoverProviderModels(provider: AiProvider): Promise<AiProviderModels> {
    const providerModels = await this.adaptersService.fetchProviderModels(provider)
    const candidates = [...new Map(providerModels.map((model) => {
      const modelId = model.modelId.trim()

      return [
        modelId,
        {
          providerId: provider.id,
          modelId,
          modelName: model.modelName.trim(),
          modelType: model.modelType,
          capabilities: [],
          contextWindow: model.contextWindow,
          maxOutputTokens: model.maxOutputTokens,
        } satisfies ProviderModelCandidate,
      ]
    })).values()]

    return {
      models: await this.mergeStoredStatus(provider.id, candidates),
    }
  }

  private async mergeStoredStatus(providerId: string, candidates: ProviderModelCandidate[]) {
    const storedModels = await this.prisma.aiProviderModel.findMany({
      where: {
        providerId,
        modelId: { in: candidates.map(model => model.modelId) },
      },
    })
    const storedModelById = new Map(storedModels.map(model => [model.modelId, model]))

    return candidates.map((candidate) => {
      const storedModel = storedModelById.get(candidate.modelId)
      if (!storedModel) {
        return {
          ...candidate,
          enabled: false,
        }
      }

      return {
        ...candidate,
        modelName: storedModel.modelName,
        modelType: toDomainModelType(storedModel.modelType),
        capabilities: storedModel.capabilities.map(toDomainCapability),
        contextWindow: storedModel.contextWindow,
        maxOutputTokens: storedModel.maxOutputTokens,
        enabled: storedModel.enabled,
        updatedAt: storedModel.updatedAt.toISOString(),
      }
    })
  }

  private async upsertModels(providerId: string, payload: UpsertAiProviderModelsDto): Promise<AiProviderModels> {
    await this.prisma.$bypass.$transaction(
      payload.models.map(model => this.buildUpsertModelQuery(providerId, model)),
    )

    return {
      models: await this.getModels(providerId),
    }
  }

  private async upsertModel(providerId: string, payload: UpsertAiProviderModelDto) {
    const item = await this.buildUpsertModelQuery(providerId, payload)
    return toProviderModelItem(item)
  }

  private buildUpsertModelQuery(providerId: string, payload: UpsertAiProviderModelDto) {
    const modelId = payload.modelId.trim()
    const modelName = payload.modelName.trim()
    if (!modelId || !modelName) {
      throw new BadRequestException('模型 ID 和模型名称不能为空')
    }
    const modelType = payload.modelType ?? inferProviderModelType(modelId)
    const capabilities = payload.capabilities ?? []
    const enabled = payload.enabled ?? true

    return this.prisma.$bypass.aiProviderModel.upsert({
      where: {
        providerId_modelId: {
          providerId,
          modelId,
        },
      },
      update: {
        modelName,
        modelType: toPrismaModelType(modelType),
        capabilities: capabilities.map(toPrismaCapability),
        contextWindow: payload.contextWindow ?? null,
        maxOutputTokens: payload.maxOutputTokens ?? null,
        enabled,
        deletedAt: null,
      },
      create: {
        providerId,
        modelId,
        modelName,
        modelType: toPrismaModelType(modelType),
        capabilities: capabilities.map(toPrismaCapability),
        contextWindow: payload.contextWindow ?? null,
        maxOutputTokens: payload.maxOutputTokens ?? null,
        enabled,
        deletedAt: null,
      },
    })
  }

  private async assertPlatformProvider(providerId: string) {
    const provider = await this.prisma.aiProvider.findFirst({
      where: {
        id: providerId,
        scope: 'PLATFORM',
      },
    })

    if (!provider) {
      throw new NotFoundException('服务商不存在')
    }

    return provider
  }

  private async assertUserProvider(userId: string, providerId: string) {
    const provider = await this.prisma.aiProvider.findFirst({
      where: {
        id: providerId,
        scope: 'USER',
        ownerUserId: userId,
      },
    })

    if (!provider) {
      throw new NotFoundException('服务商不存在')
    }

    return provider
  }
}
