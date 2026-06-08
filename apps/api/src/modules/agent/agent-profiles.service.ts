import type { AgentProfileConfig } from '@haohaoxue/samepage-contracts'
import { AgentProfileConfigSchema } from '@haohaoxue/samepage-contracts'
import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'

const agentProfileSelect = {
  id: true,
  ownerUserId: true,
  name: true,
  currentConfig: true,
} satisfies Prisma.AgentProfileSelect

export type AgentProfileForGeneration = Prisma.AgentProfileGetPayload<{
  select: typeof agentProfileSelect
}>

type AgentProfileClient = Pick<Prisma.TransactionClient, 'agentProfile'>

const DEFAULT_AGENT_PROFILE_NAME = '默认助手'

const DEFAULT_AGENT_PROFILE_CONFIG: AgentProfileConfig = AgentProfileConfigSchema.parse({
  schemaVersion: 1,
  instructions: {
    systemPrompt: '你是 SamePage 默认助手。请根据用户问题、当前对话上下文和可用文档上下文，给出清晰、准确、可执行的回答。',
  },
})

@Injectable()
export class AgentProfilesService {
  constructor(private readonly prisma: PrismaService) {}

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
}

function toJsonObject(value: object): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Prisma.InputJsonObject
}
