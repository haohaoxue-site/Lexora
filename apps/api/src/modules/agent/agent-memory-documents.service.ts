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
  getAgentMemoryLaneTitle,
  toAgentMemory,
} from './agent-memory.utils'

interface MemoryDocumentDefinition {
  id: AgentMemoryDocumentId
  name: string
  title: string
  summary: string
  emptyText: string
  lanes: AgentMemoryLane[]
}

const MEMORY_DOCUMENT_DEFINITIONS: MemoryDocumentDefinition[] = [
  {
    id: AGENT_MEMORY_DOCUMENT_ID.SOUL,
    name: 'SOUL.md',
    title: '你是谁',
    summary: 'Agent 的身份、性格、说话方式和相处原则',
    emptyText: '当前还没有可展示的 Agent 设定记忆。',
    lanes: [AGENT_MEMORY_LANE.AGENT_PERSONALIZATION],
  },
  {
    id: AGENT_MEMORY_DOCUMENT_ID.USER,
    name: 'USER.md',
    title: '用户信息',
    summary: '用户画像、偏好、状态和交互习惯',
    emptyText: '当前还没有可展示的用户画像或偏好记忆。',
    lanes: [
      AGENT_MEMORY_LANE.USER_PROFILE,
      AGENT_MEMORY_LANE.USER_PREFERENCE,
      AGENT_MEMORY_LANE.USER_FEEDBACK,
    ],
  },
  {
    id: AGENT_MEMORY_DOCUMENT_ID.MEMORY,
    name: 'MEMORY.md',
    title: '关键记忆',
    summary: '关键任务、事件、概念和注意事项',
    emptyText: '当前还没有可展示的任务、事件或概念记忆。',
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
    const documents = await this.listDocuments(userId, query)
    const document = documents.documents.find(item => item.id === documentId)

    if (!document) {
      throw new NotFoundException('记忆文档不存在')
    }

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
  const content = renderMemoryDocument(definition, documentMemories)

  return {
    id: definition.id,
    name: definition.name,
    title: definition.title,
    summary: definition.summary,
    content,
    sizeBytes: Buffer.byteLength(content, 'utf8'),
    updatedAt: getLatestUpdatedAt(documentMemories),
    sourceMemoryIds: documentMemories.map(memory => memory.id),
  }
}

function renderMemoryDocument(definition: MemoryDocumentDefinition, memories: AgentMemory[]): string {
  const lines = [`# ${definition.title}`, '']

  if (memories.length === 0) {
    lines.push(definition.emptyText)
    return lines.join('\n')
  }

  definition.lanes.forEach((lane) => {
    const laneMemories = memories.filter(memory => memory.lane === lane)
    if (laneMemories.length === 0) {
      return
    }

    if (lines.length > 2) {
      lines.push('')
    }

    lines.push(`## ${getAgentMemoryLaneTitle(lane)}`, '')
    laneMemories.forEach((memory) => {
      lines.push(`- ${formatMemoryLine(memory)}`)
    })
  })

  return lines.join('\n')
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
