import type {
  AgentProfileConfig,
  AgentProfileSettings,
  AiModelRef,
  UpdateAgentProfileModelPolicyRequest,
} from '@haohaoxue/samepage-contracts'
import {
  AgentProfileConfigSchema,
  AgentProfileSettingsSchema,
  AI_MODEL_INTENT_KEY,
} from '@haohaoxue/samepage-contracts'
import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { AiModelResolverService } from '../ai/models/resolver.service'

const agentProfileSelect = {
  id: true,
  ownerUserId: true,
  name: true,
  description: true,
  avatarUrl: true,
  currentConfig: true,
} satisfies Prisma.AgentProfileSelect

export type AgentProfileForGeneration = Prisma.AgentProfileGetPayload<{
  select: typeof agentProfileSelect
}>

type AgentProfileClient = Pick<Prisma.TransactionClient, 'agentProfile'>

const DEFAULT_AGENT_PROFILE_NAME = '小助手'

const DEFAULT_AGENT_PROFILE_CONFIG: AgentProfileConfig = AgentProfileConfigSchema.parse({
  schemaVersion: 1,
  instructions: {
    systemPrompt: '你是 SamePage 小助手。请根据用户问题、当前对话上下文和可用文档上下文，给出清晰、准确、可执行的回答。',
  },
})

@Injectable()
export class AgentProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly modelResolver: AiModelResolverService,
  ) {}

  async ensureDefaultAgentProfile(input: {
    ownerUserId: string
    tx?: Prisma.TransactionClient
  }): Promise<AgentProfileForGeneration> {
    const client = input.tx ?? this.prisma
    const existingProfile = await this.findDefaultProfile(client, input.ownerUserId)

    if (existingProfile) {
      return existingProfile
    }

    await client.agentProfile.createMany({
      data: {
        ownerUserId: input.ownerUserId,
        isDefault: true,
        name: DEFAULT_AGENT_PROFILE_NAME,
        currentConfig: toJsonObject(DEFAULT_AGENT_PROFILE_CONFIG),
      },
      skipDuplicates: true,
    })

    const profile = await this.findDefaultProfile(client, input.ownerUserId)
    if (!profile) {
      throw new InternalServerErrorException('默认 AgentProfile 创建失败')
    }

    return profile
  }

  async getDefaultAgentProfileSettings(ownerUserId: string): Promise<AgentProfileSettings> {
    const profile = await this.ensureDefaultAgentProfile({ ownerUserId })

    return toAgentProfileSettings(profile)
  }

  async updateDefaultAgentProfileModelPolicy(
    ownerUserId: string,
    payload: UpdateAgentProfileModelPolicyRequest,
  ): Promise<AgentProfileSettings> {
    const profile = await this.ensureDefaultAgentProfile({ ownerUserId })
    const modelRef = payload.modelRef
      ? await this.resolveSelectableModelRef(ownerUserId, payload.modelRef)
      : null
    const currentConfig = AgentProfileConfigSchema.parse(profile.currentConfig)
    const nextConfig = AgentProfileConfigSchema.parse({
      ...currentConfig,
      modelPolicy: createNextModelPolicy(currentConfig, modelRef),
    })

    const updatedProfile = await this.prisma.agentProfile.update({
      where: {
        id: profile.id,
      },
      data: {
        currentConfig: toJsonObject(nextConfig),
      },
      select: agentProfileSelect,
    })

    return toAgentProfileSettings(updatedProfile)
  }

  private findDefaultProfile(client: AgentProfileClient, ownerUserId: string): Promise<AgentProfileForGeneration | null> {
    return client.agentProfile.findFirst({
      where: {
        ownerUserId,
        isDefault: true,
        deletedAt: null,
      },
      select: agentProfileSelect,
      orderBy: {
        createdAt: 'asc',
      },
    })
  }

  private async resolveSelectableModelRef(
    ownerUserId: string,
    modelRef: Pick<AiModelRef, 'providerId' | 'modelId'>,
  ): Promise<Pick<AiModelRef, 'providerId' | 'modelId'>> {
    const target = await this.modelResolver.resolveModelTarget({
      actorUserId: ownerUserId,
      intentKey: AI_MODEL_INTENT_KEY.CHAT_ASSISTANT_DEFAULT,
      requestedModelRef: modelRef,
    })

    return {
      providerId: target.providerId,
      modelId: target.modelId,
    }
  }
}

function toJsonObject(value: object): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject
}

function createNextModelPolicy(
  config: AgentProfileConfig,
  modelRef: Pick<AiModelRef, 'providerId' | 'modelId'> | null,
): AgentProfileConfig['modelPolicy'] {
  const restModelPolicy = { ...config.modelPolicy }
  delete restModelPolicy.providerId
  delete restModelPolicy.modelId

  if (!modelRef) {
    return {
      ...restModelPolicy,
      selectionMode: 'user_default',
    }
  }

  return {
    ...restModelPolicy,
    selectionMode: 'fixed_model',
    providerId: modelRef.providerId,
    modelId: modelRef.modelId,
  }
}

export function resolveAgentProfileFixedModelRef(
  profile: Pick<AgentProfileForGeneration, 'currentConfig'>,
): Pick<AiModelRef, 'providerId' | 'modelId'> | null {
  const config = AgentProfileConfigSchema.parse(profile.currentConfig)
  if (
    config.modelPolicy.selectionMode !== 'fixed_model'
    || !config.modelPolicy.providerId
    || !config.modelPolicy.modelId
  ) {
    return null
  }

  return {
    providerId: config.modelPolicy.providerId,
    modelId: config.modelPolicy.modelId,
  }
}

function toAgentProfileSettings(profile: AgentProfileForGeneration): AgentProfileSettings {
  return AgentProfileSettingsSchema.parse({
    profileId: profile.id,
    name: profile.name,
    description: profile.description,
    avatarUrl: profile.avatarUrl,
    modelRef: resolveAgentProfileFixedModelRef(profile),
  })
}
