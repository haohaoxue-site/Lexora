import type { AgentMemory as PrismaAgentMemory } from '@prisma/client'
import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'
import { buildAgentMemorySearchText } from './agent-memory.utils'

@Injectable()
export class AgentMemoryIndexingService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async syncMemoryIndex(memory: PrismaAgentMemory): Promise<void> {
    const searchText = buildAgentMemorySearchText(memory)
    const contentHash = createHash('sha256').update(searchText).digest('hex')
    await this.prisma.agentMemorySearchIndex.upsert({
      where: {
        memoryId: memory.id,
      },
      create: {
        memoryId: memory.id,
        scope: memory.scope,
        lane: memory.lane,
        ownerUserId: memory.ownerUserId,
        workspaceId: memory.workspaceId,
        agentProfileId: memory.agentProfileId,
        searchText,
        contentHash,
        indexedAt: new Date(),
      },
      update: {
        scope: memory.scope,
        lane: memory.lane,
        ownerUserId: memory.ownerUserId,
        workspaceId: memory.workspaceId,
        agentProfileId: memory.agentProfileId,
        searchText,
        contentHash,
        indexedAt: new Date(),
      },
    })
  }

  async deleteMemoryIndex(memoryId: string): Promise<void> {
    await this.prisma.agentMemorySearchIndex.deleteMany({
      where: { memoryId },
    })
  }
}
