import type { AiModelServiceConfigSummary } from '@haohaoxue/samepage-contracts'
import type { CreateAiModelServiceDto, UpdateAiModelServiceDto } from '../ai.dto'
import { AI_MODEL_ENDPOINT_MODE } from '@haohaoxue/samepage-contracts'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../database/prisma.service'
import {
  toModelServiceSummary,
  toPrismaAuthMode,
  toPrismaEndpointMode,
  toPrismaScope,
} from '../ai.utils'
import { AiProviderAdaptersService } from '../providers/adapters.service'
import { AiProviderTemplatesService } from '../providers/templates.service'

const TRAILING_SLASHES_RE = /\/+$/
const CUSTOM_PROVIDER_KEYS = new Set(['openai-compatible', 'anthropic-compatible'])

@Injectable()
export class AiModelServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templatesService: AiProviderTemplatesService,
    private readonly adaptersService: AiProviderAdaptersService,
  ) {}

  async getSystemServices(): Promise<AiModelServiceConfigSummary[]> {
    const services = await this.prisma.aiModelServiceConfig.findMany({
      where: { scope: 'SYSTEM' },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { models: true },
        },
      },
    })

    return services.map(toModelServiceSummary)
  }

  async getUserServices(userId: string): Promise<AiModelServiceConfigSummary[]> {
    const services = await this.prisma.aiModelServiceConfig.findMany({
      where: {
        scope: 'USER',
        ownerUserId: userId,
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { models: true },
        },
      },
    })

    return services.map(toModelServiceSummary)
  }

  createSystemService(actorUserId: string, payload: CreateAiModelServiceDto): Promise<AiModelServiceConfigSummary> {
    return this.createService({
      scope: 'system',
      actorUserId,
      ownerUserId: null,
      payload,
    })
  }

  createUserService(userId: string, payload: CreateAiModelServiceDto): Promise<AiModelServiceConfigSummary> {
    return this.createService({
      scope: 'user',
      actorUserId: userId,
      ownerUserId: userId,
      payload,
    })
  }

  updateSystemService(actorUserId: string, configId: string, payload: UpdateAiModelServiceDto): Promise<AiModelServiceConfigSummary> {
    return this.updateService({
      actorUserId,
      configId,
      where: {
        id: configId,
        scope: 'SYSTEM',
      },
      payload,
    })
  }

  updateUserService(userId: string, configId: string, payload: UpdateAiModelServiceDto): Promise<AiModelServiceConfigSummary> {
    return this.updateService({
      actorUserId: userId,
      configId,
      where: {
        id: configId,
        scope: 'USER',
        ownerUserId: userId,
      },
      payload,
    })
  }

  async deleteSystemService(configId: string): Promise<void> {
    await this.deleteService({
      id: configId,
      scope: 'SYSTEM',
    })
  }

  async deleteUserService(userId: string, configId: string): Promise<void> {
    await this.deleteService({
      id: configId,
      scope: 'USER',
      ownerUserId: userId,
    })
  }

  async getAccessibleServiceForUser(userId: string, configId: string) {
    const service = await this.prisma.aiModelServiceConfig.findFirst({
      where: {
        id: configId,
        enabled: true,
        OR: [
          { scope: 'SYSTEM', visibility: 'ALL_USERS' },
          { scope: 'USER', ownerUserId: userId },
        ],
      },
    })

    if (!service) {
      throw new NotFoundException('模型服务不可用')
    }

    return service
  }

  private async createService(params: {
    scope: 'system' | 'user'
    actorUserId: string
    ownerUserId: string | null
    payload: CreateAiModelServiceDto
  }) {
    const template = this.templatesService.getTemplateOrThrow(params.payload.providerKey)
    const endpoint = this.resolveEndpoint(template.endpointMode, template.fixedEndpoint ?? null, params.payload.endpoint, false)
    const apiKey = params.payload.apiKey?.trim()
    const service = await this.prisma.aiModelServiceConfig.create({
      data: {
        scope: toPrismaScope(params.scope),
        ownerUserId: params.ownerUserId,
        providerKey: template.providerKey,
        providerName: params.payload.providerName?.trim() || template.providerName,
        adapterKey: template.adapterKey,
        endpointMode: toPrismaEndpointMode(template.endpointMode),
        endpoint,
        authMode: toPrismaAuthMode(template.authMode),
        apiKeyEncrypted: apiKey ? this.adaptersService.encryptApiKey(apiKey) : null,
        enabled: false,
        visibility: 'ALL_USERS',
        updatedBy: params.actorUserId,
      },
      include: {
        _count: {
          select: { models: true },
        },
      },
    })

    return toModelServiceSummary(service)
  }

  private async updateService(params: {
    actorUserId: string
    configId: string
    where: Prisma.AiModelServiceConfigWhereInput
    payload: UpdateAiModelServiceDto
  }) {
    const current = await this.prisma.aiModelServiceConfig.findFirst({
      where: params.where,
    })

    if (!current) {
      throw new NotFoundException('模型服务不存在')
    }

    const nextProviderKey = params.payload.providerKey?.trim()
    const isProviderChanged = Boolean(nextProviderKey && nextProviderKey !== current.providerKey)
    const template = nextProviderKey
      ? this.resolveEditableTemplate(current.providerKey, nextProviderKey)
      : this.templatesService.getTemplateOrThrow(current.providerKey)
    const apiKey = params.payload.apiKey?.trim()
    const data: Prisma.AiModelServiceConfigUpdateInput = {
      updatedByUser: {
        connect: { id: params.actorUserId },
      },
    }

    if (typeof params.payload.providerName === 'string') {
      data.providerName = params.payload.providerName.trim()
    }
    if (nextProviderKey) {
      data.providerKey = template.providerKey
      data.adapterKey = template.adapterKey
      data.endpointMode = toPrismaEndpointMode(template.endpointMode)
      data.authMode = toPrismaAuthMode(template.authMode)
    }
    if (typeof params.payload.endpoint === 'string') {
      data.endpoint = this.resolveEndpoint(template.endpointMode, template.fixedEndpoint ?? null, params.payload.endpoint, false)
    }
    if (apiKey) {
      data.apiKeyEncrypted = this.adaptersService.encryptApiKey(apiKey)
    }
    if (params.payload.clearApiKey) {
      data.apiKeyEncrypted = null
    }
    if (typeof params.payload.enabled === 'boolean') {
      if (params.payload.enabled && isProviderChanged) {
        throw new BadRequestException('切换服务商类型后，请先重新同步模型列表再启用服务商')
      }

      if (params.payload.enabled && !current.enabled) {
        const existingModelCount = await this.prisma.aiModelItem.count({
          where: { serviceConfigId: params.configId },
        })

        if (existingModelCount === 0) {
          throw new BadRequestException('请先同步模型列表后再启用服务商')
        }
      }

      data.enabled = params.payload.enabled
    }

    if (isProviderChanged) {
      data.enabled = false
    }

    const service = await this.prisma.$bypass.$transaction(async (tx) => {
      if (nextProviderKey && nextProviderKey !== current.providerKey) {
        await tx.aiDefaultModelPolicy.deleteMany({
          where: { serviceConfigId: params.configId },
        })
        await tx.aiModelItem.deleteMany({
          where: { serviceConfigId: params.configId },
        })
      }

      return tx.aiModelServiceConfig.update({
        where: { id: params.configId },
        data,
        include: {
          _count: {
            select: { models: true },
          },
        },
      })
    })

    return toModelServiceSummary(service)
  }

  private async deleteService(where: Prisma.AiModelServiceConfigWhereInput) {
    const deleted = await this.prisma.aiModelServiceConfig.deleteMany({
      where,
    })

    if (deleted.count === 0) {
      throw new NotFoundException('模型服务不存在')
    }
  }

  private resolveEditableTemplate(currentProviderKey: string, nextProviderKey: string) {
    if (!CUSTOM_PROVIDER_KEYS.has(currentProviderKey) || !CUSTOM_PROVIDER_KEYS.has(nextProviderKey)) {
      throw new BadRequestException('仅自定义 compatible 服务允许切换类型')
    }

    return this.templatesService.getTemplateOrThrow(nextProviderKey)
  }

  private resolveEndpoint(endpointMode: string, fixedEndpoint: string | null, endpoint: string | undefined, required: boolean) {
    if (endpointMode === AI_MODEL_ENDPOINT_MODE.FIXED) {
      return fixedEndpoint
    }

    const normalizedEndpoint = endpoint?.trim()
    if (!normalizedEndpoint) {
      if (required) {
        throw new BadRequestException('请填写 API 地址')
      }
      return null
    }

    return normalizedEndpoint.replace(TRAILING_SLASHES_RE, '')
  }
}
