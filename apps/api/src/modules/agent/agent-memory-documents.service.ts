import type {
  AgentMemory,
  AgentMemoryDocument,
  AgentMemoryDocumentId,
  AgentMemoryDocumentsResponse,
  AgentMemoryLane,
  ListAgentMemoryDocumentsQuery,
} from '@haohaoxue/samepage-contracts'
import { Buffer } from 'node:buffer'
import {
  AGENT_MEMORY_DOCUMENT_ID,
  AGENT_MEMORY_LANE,
  AgentMemoryDocumentSchema,
  AgentMemoryDocumentsResponseSchema,
} from '@haohaoxue/samepage-contracts'
import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'
import {
  toAgentMemory,
} from './agent-memory.utils'

interface MemoryDocumentDefinition {
  id: AgentMemoryDocumentId
  name: string
  summary: string
  lanes: AgentMemoryLane[]
}

const MEMORY_DOCUMENT_DEFINITIONS: MemoryDocumentDefinition[] = [
  {
    id: AGENT_MEMORY_DOCUMENT_ID.SOUL,
    name: 'SOUL.md',
    summary: 'Agent 的身份、性格、说话方式和相处原则',
    lanes: [AGENT_MEMORY_LANE.AGENT_PERSONALIZATION],
  },
  {
    id: AGENT_MEMORY_DOCUMENT_ID.USER,
    name: 'USER.md',
    summary: '用户画像、偏好、状态和交互习惯',
    lanes: [
      AGENT_MEMORY_LANE.USER_PROFILE,
      AGENT_MEMORY_LANE.USER_PREFERENCE,
      AGENT_MEMORY_LANE.USER_FEEDBACK,
    ],
  },
  {
    id: AGENT_MEMORY_DOCUMENT_ID.MEMORY,
    name: 'MEMORY.md',
    summary: '关键任务、事件、概念和注意事项',
    lanes: [
      AGENT_MEMORY_LANE.PROJECT_REFERENCE,
      AGENT_MEMORY_LANE.TASK_KNOWLEDGE,
    ],
  },
]

@Injectable()
export class AgentMemoryDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listDocuments(userId: string, query: ListAgentMemoryDocumentsQuery = {}): Promise<AgentMemoryDocumentsResponse> {
    const agentProfileId = await this.resolveAgentProfileId(userId, query.agentProfileId)
    const memories = await this.findActiveMemories(userId, agentProfileId)

    return AgentMemoryDocumentsResponseSchema.parse({
      documents: MEMORY_DOCUMENT_DEFINITIONS.map(definition => createMemoryDocument(definition, memories)),
    })
  }

  async getDocument(userId: string, documentId: AgentMemoryDocumentId, query: ListAgentMemoryDocumentsQuery = {}): Promise<AgentMemoryDocument> {
    const definition = MEMORY_DOCUMENT_DEFINITIONS.find(item => item.id === documentId)
    if (!definition) {
      throw new NotFoundException('记忆文档不存在')
    }

    const agentProfileId = await this.resolveAgentProfileId(userId, query.agentProfileId)
    const memories = await this.findActiveMemories(userId, agentProfileId)
    const document = createMemoryDocument(definition, memories)

    return AgentMemoryDocumentSchema.parse(document)
  }

  private async resolveAgentProfileId(userId: string, agentProfileId: string | undefined): Promise<string | null> {
    const normalized = agentProfileId?.trim()
    if (!normalized) {
      return null
    }

    const profile = await this.prisma.agentProfile.findFirst({
      where: {
        id: normalized,
        ownerUserId: userId,
        deletedAt: null,
      },
      select: { id: true },
    })

    if (!profile) {
      throw new NotFoundException('AgentProfile 不存在')
    }

    return profile.id
  }

  private async findActiveMemories(userId: string, agentProfileId: string | null): Promise<AgentMemory[]> {
    const now = new Date()
    const memories = await this.prisma.agentMemory.findMany({
      where: {
        ownerUserId: userId,
        status: 'ACTIVE',
        deletedAt: null,
        AND: [
          {
            OR: [
              { scope: 'USER' },
              ...(agentProfileId
                ? [{ scope: 'USER_AGENT' as const, agentProfileId }]
                : []),
            ],
          },
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: now } },
            ],
          },
        ],
      },
      orderBy: [
        { updatedAt: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    return memories.map(toAgentMemory)
  }
}

function createMemoryDocument(
  definition: MemoryDocumentDefinition,
  memories: AgentMemory[],
): AgentMemoryDocument {
  const documentMemories = memories.filter(memory => definition.lanes.includes(memory.lane))
  const content = renderMemoryDocument(documentMemories)

  return {
    id: definition.id,
    name: definition.name,
    summary: definition.summary,
    content,
    sizeBytes: Buffer.byteLength(content, 'utf8'),
    updatedAt: getLatestUpdatedAt(documentMemories),
    sourceMemoryIds: documentMemories.map(memory => memory.id),
  }
}

function renderMemoryDocument(memories: AgentMemory[]): string {
  return memories.map(memory => `- ${formatMemoryLine(memory)}`).join('\n')
}

function formatMemoryLine(memory: AgentMemory): string {
  const text = normalizeMemoryText(memory.summary ?? memory.content)
  const slotValue = normalizeMemoryText(memory.slotValue ?? '')

  if (slotValue && !text.includes(slotValue)) {
    return `${text}（${slotValue}）`
  }

  return text
}

function normalizeMemoryText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function getLatestUpdatedAt(memories: AgentMemory[]): string | null {
  const latest = memories.reduce<number | null>((result, memory) => {
    const value = Date.parse(memory.updatedAt)
    if (!Number.isFinite(value)) {
      return result
    }

    return result === null ? value : Math.max(result, value)
  }, null)

  return latest === null ? null : new Date(latest).toISOString()
}
