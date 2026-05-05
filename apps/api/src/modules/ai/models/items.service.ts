import type { AiModelItem, AiModelSyncResult } from '@haohaoxue/samepage-contracts'
import type { AiModelServiceConfig } from '@prisma/client'
import type {
  CreateAiModelItemDto,
  UpdateAiModelItemDto,
} from '../ai.dto'
import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../database/prisma.service'
import {
  toModelItem,
  toPrismaCapability,
  toPrismaModelType,
} from '../ai.utils'
import { AiProviderAdaptersService } from '../providers/adapters.service'

@Injectable()
export class AiModelItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adaptersService: AiProviderAdaptersService,
  ) {}

  async getSystemModels(configId: string): Promise<AiModelItem[]> {
    await this.assertSystemService(configId)
    return this.getModels(configId)
  }

  async getUserModels(userId: string, configId: string): Promise<AiModelItem[]> {
    await this.assertUserService(userId, configId)
    return this.getModels(configId)
  }

  async syncSystemProviderModels(configId: string): Promise<AiModelSyncResult> {
    const service = await this.assertSystemService(configId)
    return this.syncProviderModels(service)
  }

  async syncUserProviderModels(userId: string, configId: string): Promise<AiModelSyncResult> {
    const service = await this.assertUserService(userId, configId)
    return this.syncProviderModels(service)
  }

  async createSystemModel(configId: string, payload: CreateAiModelItemDto): Promise<AiModelItem> {
    await this.assertSystemService(configId)
    return this.createModel(configId, payload)
  }

  async createUserModel(userId: string, configId: string, payload: CreateAiModelItemDto): Promise<AiModelItem> {
    await this.assertUserService(userId, configId)
    return this.createModel(configId, payload)
  }

  async updateSystemModel(configId: string, modelItemId: string, payload: UpdateAiModelItemDto): Promise<AiModelItem> {
    await this.assertSystemService(configId)
    return this.updateModel(configId, modelItemId, payload)
  }

  async updateUserModel(userId: string, configId: string, modelItemId: string, payload: UpdateAiModelItemDto): Promise<AiModelItem> {
    await this.assertUserService(userId, configId)
    return this.updateModel(configId, modelItemId, payload)
  }

  async deleteSystemModel(configId: string, modelItemId: string): Promise<void> {
    await this.assertSystemService(configId)
    await this.deleteModel(configId, modelItemId)
  }

  async deleteUserModel(userId: string, configId: string, modelItemId: string): Promise<void> {
    await this.assertUserService(userId, configId)
    await this.deleteModel(configId, modelItemId)
  }

  private async getModels(configId: string) {
    const models = await this.prisma.aiModelItem.findMany({
      where: { serviceConfigId: configId },
      orderBy: [
        { modelType: 'asc' },
        { modelName: 'asc' },
      ],
    })

    return models.map(toModelItem)
  }

  private async syncProviderModels(service: AiModelServiceConfig): Promise<AiModelSyncResult> {
    const providerModels = await this.adaptersService.fetchProviderModels(service)
    const normalizedProviderModels = [...new Map(providerModels.map((model) => {
      const modelId = model.modelId.trim()

      return [
        modelId,
        {
          ...model,
          modelId,
          modelName: model.modelName.trim(),
        },
      ]
    })).values()]

    await this.prisma.$bypass.$transaction([
      ...normalizedProviderModels.map(model => this.prisma.$bypass.aiModelItem.upsert({
        where: {
          serviceConfigId_modelId: {
            serviceConfigId: service.id,
            modelId: model.modelId,
          },
        },
        update: {
          modelName: model.modelName,
          modelType: toPrismaModelType(model.modelType),
          capabilities: [],
          contextWindow: model.contextWindow,
          maxOutputTokens: model.maxOutputTokens,
          deletedAt: null,
        },
        create: {
          serviceConfigId: service.id,
          modelId: model.modelId,
          modelName: model.modelName,
          modelType: toPrismaModelType(model.modelType),
          capabilities: [],
          contextWindow: model.contextWindow,
          maxOutputTokens: model.maxOutputTokens,
          enabled: false,
          deletedAt: null,
        },
      })),
      this.prisma.$bypass.aiModelItem.deleteMany({
        where: {
          serviceConfigId: service.id,
          modelId: {
            notIn: normalizedProviderModels.map(model => model.modelId),
          },
        },
      }),
    ])

    return {
      models: await this.getModels(service.id),
    }
  }

  private async createModel(configId: string, payload: CreateAiModelItemDto) {
    const item = await this.prisma.aiModelItem.create({
      data: {
        serviceConfigId: configId,
        modelId: payload.modelId.trim(),
        modelName: payload.modelName.trim(),
        modelType: toPrismaModelType(payload.modelType),
        capabilities: payload.capabilities.map(toPrismaCapability),
        contextWindow: payload.contextWindow ?? null,
        maxOutputTokens: payload.maxOutputTokens ?? null,
      },
    })

    return toModelItem(item)
  }

  private async updateModel(configId: string, modelItemId: string, payload: UpdateAiModelItemDto) {
    const current = await this.prisma.aiModelItem.findFirst({
      where: {
        id: modelItemId,
        serviceConfigId: configId,
      },
    })

    if (!current) {
      throw new NotFoundException('模型不存在')
    }

    const item = await this.prisma.aiModelItem.update({
      where: {
        id: modelItemId,
      },
      data: {
        ...(typeof payload.modelName === 'string' ? { modelName: payload.modelName.trim() } : {}),
        ...(payload.modelType ? { modelType: toPrismaModelType(payload.modelType) } : {}),
        ...(payload.capabilities ? { capabilities: payload.capabilities.map(toPrismaCapability) } : {}),
        ...(typeof payload.contextWindow === 'number' ? { contextWindow: payload.contextWindow } : {}),
        ...(typeof payload.maxOutputTokens === 'number' ? { maxOutputTokens: payload.maxOutputTokens } : {}),
        ...(typeof payload.enabled === 'boolean' ? { enabled: payload.enabled } : {}),
      },
    })

    return toModelItem(item)
  }

  private async deleteModel(configId: string, modelItemId: string) {
    const deleted = await this.prisma.aiModelItem.deleteMany({
      where: {
        id: modelItemId,
        serviceConfigId: configId,
      },
    })

    if (deleted.count === 0) {
      throw new NotFoundException('模型不存在')
    }
  }

  private async assertSystemService(configId: string) {
    const service = await this.prisma.aiModelServiceConfig.findFirst({
      where: {
        id: configId,
        scope: 'SYSTEM',
      },
    })

    if (!service) {
      throw new NotFoundException('模型服务不存在')
    }

    return service
  }

  private async assertUserService(userId: string, configId: string) {
    const service = await this.prisma.aiModelServiceConfig.findFirst({
      where: {
        id: configId,
        scope: 'USER',
        ownerUserId: userId,
      },
    })

    if (!service) {
      throw new NotFoundException('模型服务不存在')
    }

    return service
  }
}
