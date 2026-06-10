import type {
  AgentMemory,
  AgentMemoryOperation,
  ChatMemoryOperationProjection,
} from '@haohaoxue/samepage-contracts'
import type {
  AgentMemoryCandidateKind as PrismaAgentMemoryCandidateKind,
  AgentMemoryOperationAction as PrismaAgentMemoryOperationAction,
} from '@prisma/client'
import type { ExtractedMemoryOperation } from './agent-memory-operations.utils'
import { randomUUID } from 'node:crypto'
import {
  AGENT_MEMORY_LANE,
  AGENT_MEMORY_OPERATION_ACTION,
  AGENT_MEMORY_OPERATION_MODE,
  AGENT_MEMORY_SCOPE,
  AGENT_MEMORY_SENSITIVITY,
  AGENT_MEMORY_SOURCE_TYPE,
  AgentMemoryOperationSchema,
  ChatMemoryOperationProjectionSchema,
} from '@haohaoxue/samepage-contracts'
import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { extractExplicitMemoryOperations } from './agent-memory-operations.utils'
import { AgentMemoryService } from './agent-memory.service'
import {
  isUnsafeAgentMemoryPayload,
  normalizeAgentMemorySlotKey,
  toAgentMemory,
  toPrismaMemoryLane,
  toPrismaMemoryScope,
} from './agent-memory.utils'

export interface ProcessUserMessageMemoryOperationsInput {
  userId: string
  sessionId: string
  messageId: string
  generationId: string
  agentProfileId: string | null
  content: string
}

@Injectable()
export class AgentMemoryOperationsService {
  private readonly logger = new Logger(AgentMemoryOperationsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly memories: AgentMemoryService,
  ) {}

  async processUserMessage(input: ProcessUserMessageMemoryOperationsInput): Promise<ChatMemoryOperationProjection[]> {
    const operations = extractExplicitMemoryOperations(input.content)
      .map(operation => this.createOperation(input, operation))

    const projections: ChatMemoryOperationProjection[] = []
    for (const operation of operations) {
      try {
        projections.push(await this.executeOperation(input, operation))
      }
      catch (error) {
        this.logger.warn(`agent memory operation failed: ${formatErrorMessage(error)}`)
        projections.push(this.createProjection(operation, {
          status: 'failed',
          title: '记忆更新失败',
          detail: operation.content ?? operation.query,
          reason: '记忆操作执行失败，请稍后重试。',
          memoryIds: [],
          candidateId: null,
        }))
      }
    }

    return projections
  }

  private createOperation(
    input: ProcessUserMessageMemoryOperationsInput,
    extracted: ExtractedMemoryOperation,
  ): AgentMemoryOperation {
    return AgentMemoryOperationSchema.parse({
      operationId: randomUUID(),
      source: {
        sessionId: input.sessionId,
        messageId: input.messageId,
        generationId: input.generationId,
        userId: input.userId,
      },
      action: extracted.action,
      mode: extracted.mode,
      scope: extracted.scope,
      lane: extracted.lane,
      slotKey: normalizeAgentMemorySlotKey(extracted.slotKey),
      slotValue: extracted.slotValue,
      content: extracted.content,
      summary: extracted.summary,
      query: extracted.query,
      relatedMemoryIds: [],
      confidence: extracted.confidence,
      sensitivity: extracted.sensitivity,
      reason: extracted.reason,
      createdAt: new Date().toISOString(),
    })
  }

  private async executeOperation(
    input: ProcessUserMessageMemoryOperationsInput,
    operation: AgentMemoryOperation,
  ): Promise<ChatMemoryOperationProjection> {
    if (operation.action === AGENT_MEMORY_OPERATION_ACTION.FORGET) {
      return this.executeForgetOperation(input, operation)
    }

    if (
      operation.action === AGENT_MEMORY_OPERATION_ACTION.CREATE
      || operation.action === AGENT_MEMORY_OPERATION_ACTION.APPEND
      || operation.action === AGENT_MEMORY_OPERATION_ACTION.UPDATE
    ) {
      return this.executeWriteOperation(input, operation)
    }

    return this.createProjection(operation, {
      status: 'ignored',
      title: '未更新记忆',
      detail: null,
      reason: operation.reason ?? '当前记忆操作暂不支持自动执行。',
      memoryIds: [],
      candidateId: null,
    })
  }

  private async executeWriteOperation(
    input: ProcessUserMessageMemoryOperationsInput,
    operation: AgentMemoryOperation,
  ): Promise<ChatMemoryOperationProjection> {
    if (!operation.content) {
      return this.createProjection(operation, {
        status: 'ignored',
        title: '未更新记忆',
        detail: null,
        reason: '缺少可保存的记忆内容。',
        memoryIds: [],
        candidateId: null,
      })
    }

    if (operation.scope === AGENT_MEMORY_SCOPE.USER_AGENT && !input.agentProfileId) {
      return this.createProjection(operation, {
        status: 'ignored',
        title: '未更新记忆',
        detail: operation.content,
        reason: '当前对话没有绑定 Agent。',
        memoryIds: [],
        candidateId: null,
      })
    }

    if (isUnsafeAgentMemoryPayload({
      slotValue: operation.slotValue,
      summary: operation.summary,
      content: operation.content,
    })) {
      const candidateId = await this.createPendingCandidate(input, operation, '记忆内容需要进一步确认。')
      return this.createProjection({
        ...operation,
        mode: AGENT_MEMORY_OPERATION_MODE.PENDING_CONFIRMATION,
      }, {
        status: 'pending_confirmation',
        title: '待确认记忆',
        detail: operation.content,
        reason: '内容可能包含敏感信息或提示注入风险。',
        memoryIds: [],
        candidateId,
      })
    }

    const duplicate = operation.slotKey ? null : await this.findDuplicateMemory(input, operation)
    if (duplicate) {
      return this.createProjection(operation, {
        status: 'ignored',
        title: '记忆已存在',
        detail: duplicate.content,
        reason: '已存在相同记忆，未重复保存。',
        memoryIds: [duplicate.id],
        candidateId: null,
      })
    }

    const memory = await this.memories.createAcceptedMemory(input.userId, {
      scope: operation.scope,
      lane: operation.lane,
      agentProfileId: operation.scope === AGENT_MEMORY_SCOPE.USER_AGENT ? input.agentProfileId : null,
      slotKey: operation.slotKey,
      slotValue: operation.slotValue,
      content: operation.content,
      summary: operation.summary,
      sensitivity: operation.sensitivity,
      confidence: operation.confidence,
      sourceType: AGENT_MEMORY_SOURCE_TYPE.USER_FEEDBACK,
      sourceSessionId: input.sessionId,
      sourceMessageId: input.messageId,
      sourceGenerationId: input.generationId,
    })

    return this.createProjection(operation, {
      status: 'applied',
      title: operation.slotKey ? '已更新记忆' : '已记住',
      detail: memory.content,
      reason: operation.reason,
      memoryIds: [memory.id],
      candidateId: null,
    })
  }

  private async executeForgetOperation(
    input: ProcessUserMessageMemoryOperationsInput,
    operation: AgentMemoryOperation,
  ): Promise<ChatMemoryOperationProjection> {
    const memories = await this.findRelatedMemories(input, operation)
    if (memories.length === 0) {
      return this.createProjection(operation, {
        status: 'ignored',
        title: '未找到可忘记的记忆',
        detail: operation.query,
        reason: '没有找到匹配的已确认记忆。',
        memoryIds: [],
        candidateId: null,
      })
    }

    const archivedMemoryIds = await this.memories.archiveMemories(input.userId, memories.map(memory => memory.id))
    if (archivedMemoryIds.length === 0) {
      return this.createProjection(operation, {
        status: 'ignored',
        title: '未找到可忘记的记忆',
        detail: operation.query,
        reason: '没有找到匹配的已确认记忆。',
        memoryIds: [],
        candidateId: null,
      })
    }

    return this.createProjection(operation, {
      status: 'applied',
      title: '已忘记记忆',
      detail: `已归档 ${archivedMemoryIds.length} 条相关记忆。`,
      reason: operation.reason,
      memoryIds: archivedMemoryIds,
      candidateId: null,
    })
  }

  private async createPendingCandidate(
    input: ProcessUserMessageMemoryOperationsInput,
    operation: AgentMemoryOperation,
    reason: string,
  ): Promise<string> {
    const candidate = await this.prisma.agentMemoryCandidate.create({
      data: {
        ownerUserId: input.userId,
        agentProfileId: operation.scope === AGENT_MEMORY_SCOPE.USER_AGENT ? input.agentProfileId : null,
        sessionId: input.sessionId,
        sourceMessageId: input.messageId,
        sourceGenerationId: input.generationId,
        kind: toPrismaCandidateKind(operation),
        action: toPrismaOperationAction(operation.action),
        mode: 'PENDING_CONFIRMATION',
        status: 'PENDING',
        scope: toPrismaMemoryScope(operation.scope),
        lane: toPrismaMemoryLane(operation.lane),
        slotKey: operation.slotKey,
        slotValue: operation.slotValue,
        content: operation.content ?? operation.query ?? '',
        summary: operation.summary,
        reason,
        confidence: operation.confidence,
        sensitivity: operation.sensitivity === AGENT_MEMORY_SENSITIVITY.SENSITIVE ? 'SENSITIVE' : 'NORMAL',
        relatedMemoryIds: [],
        resultMemoryIds: [],
        operation: toJsonValue({
          ...operation,
          mode: AGENT_MEMORY_OPERATION_MODE.PENDING_CONFIRMATION,
        }),
      },
      select: {
        id: true,
      },
    })

    return candidate.id
  }

  private async findDuplicateMemory(
    input: ProcessUserMessageMemoryOperationsInput,
    operation: AgentMemoryOperation,
  ): Promise<AgentMemory | null> {
    if (!operation.content) {
      return null
    }

    const memory = await this.prisma.agentMemory.findFirst({
      where: {
        ownerUserId: input.userId,
        scope: toPrismaMemoryScope(operation.scope),
        lane: toPrismaMemoryLane(operation.lane),
        agentProfileId: operation.scope === AGENT_MEMORY_SCOPE.USER_AGENT ? input.agentProfileId : null,
        content: operation.content,
        status: 'ACTIVE',
        deletedAt: null,
      },
    })

    return memory ? toAgentMemory(memory) : null
  }

  private async findRelatedMemories(
    input: ProcessUserMessageMemoryOperationsInput,
    operation: AgentMemoryOperation,
  ): Promise<Array<{ id: string }>> {
    const baseWhere: Prisma.AgentMemoryWhereInput = {
      ownerUserId: input.userId,
      scope: toPrismaMemoryScope(operation.scope),
      lane: toPrismaMemoryLane(operation.lane),
      agentProfileId: operation.scope === AGENT_MEMORY_SCOPE.USER_AGENT ? input.agentProfileId : null,
      status: 'ACTIVE',
      deletedAt: null,
    }
    const exactKeywords = createExactSearchKeywords(operation)
    const exactMatches = exactKeywords.length > 0
      ? await this.prisma.agentMemory.findMany({
          where: {
            ...baseWhere,
            OR: createContainsConditions(exactKeywords),
          },
          select: {
            id: true,
          },
          take: 20,
        })
      : []

    if (exactMatches.length > 0) {
      return exactMatches
    }

    const keywords = createSearchKeywords(operation)
    if (keywords.length === 0) {
      return []
    }

    return this.prisma.agentMemory.findMany({
      where: {
        ...baseWhere,
        OR: createContainsConditions(keywords),
      },
      select: {
        id: true,
      },
      take: 20,
    })
  }

  private createProjection(
    operation: AgentMemoryOperation,
    input: {
      status: ChatMemoryOperationProjection['status']
      title: string
      detail: string | null
      reason: string | null
      memoryIds: string[]
      candidateId: string | null
    },
  ): ChatMemoryOperationProjection {
    return ChatMemoryOperationProjectionSchema.parse({
      operationId: operation.operationId,
      action: operation.action,
      mode: operation.mode,
      status: input.status,
      scope: operation.scope,
      lane: operation.lane,
      memoryIds: input.memoryIds,
      candidateId: input.candidateId,
      title: input.title,
      detail: input.detail,
      reason: input.reason,
      createdAt: new Date().toISOString(),
    })
  }
}

function createExactSearchKeywords(operation: AgentMemoryOperation): string[] {
  const query = operation.query ?? operation.content ?? operation.slotValue ?? ''
  const target = normalizeSearchTerm(query)
    .replace(/^我/u, '')
    .replace(/^喜欢/u, '')
    .replace(/(?:这件事|这点|这个|这些)$/u, '')
    .trim()

  return [...new Set([query, target].map(normalizeSearchTerm).filter(term => term.length >= 2))]
}

function createSearchKeywords(operation: AgentMemoryOperation): string[] {
  const query = createExactSearchKeywords(operation).at(-1) ?? operation.query ?? operation.content ?? operation.slotValue ?? ''
  const tokens = query.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+|[a-z0-9][\w.:-]*/giu) ?? []
  const genericTerms = new Set(['我', '用户', '喜欢', '记住', '忘记', '这件事', '这个', '这些'])
  const terms = tokens.flatMap((token) => {
    if (genericTerms.has(token)) {
      return []
    }

    if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(token)) {
      return token.length >= 2 ? [token] : []
    }

    const chars = [...token]
    return [
      token,
      ...Array.from({ length: Math.max(0, chars.length - 1) }, (_, index) => chars.slice(index, index + 2).join('')),
    ]
  })

  return [...new Set(terms.map(term => term.trim()).filter(term => term.length >= 2))].slice(0, 12)
}

function createContainsConditions(keywords: string[]): Prisma.AgentMemoryWhereInput[] {
  return keywords.flatMap(keyword => [
    { content: { contains: keyword, mode: 'insensitive' as const } },
    { summary: { contains: keyword, mode: 'insensitive' as const } },
    { slotValue: { contains: keyword, mode: 'insensitive' as const } },
  ])
}

function normalizeSearchTerm(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ')
}

function toPrismaOperationAction(action: AgentMemoryOperation['action']): PrismaAgentMemoryOperationAction {
  switch (action) {
    case AGENT_MEMORY_OPERATION_ACTION.APPEND:
      return 'APPEND'
    case AGENT_MEMORY_OPERATION_ACTION.UPDATE:
      return 'UPDATE'
    case AGENT_MEMORY_OPERATION_ACTION.DISABLE:
      return 'DISABLE'
    case AGENT_MEMORY_OPERATION_ACTION.FORGET:
      return 'FORGET'
    case AGENT_MEMORY_OPERATION_ACTION.IGNORE:
      return 'IGNORE'
    case AGENT_MEMORY_OPERATION_ACTION.ASK_USER:
      return 'ASK_USER'
    case AGENT_MEMORY_OPERATION_ACTION.CREATE:
      return 'CREATE'
  }
}

function toPrismaCandidateKind(operation: Pick<AgentMemoryOperation, 'lane' | 'action'>): PrismaAgentMemoryCandidateKind {
  if (operation.action === AGENT_MEMORY_OPERATION_ACTION.FORGET) {
    return 'FORGET_REQUEST'
  }

  switch (operation.lane) {
    case AGENT_MEMORY_LANE.USER_PROFILE:
      return 'PROFILE'
    case AGENT_MEMORY_LANE.USER_PREFERENCE:
      return 'PREFERENCE'
    case AGENT_MEMORY_LANE.USER_FEEDBACK:
      return 'FEEDBACK'
    case AGENT_MEMORY_LANE.PROJECT_REFERENCE:
      return 'PROJECT_REFERENCE'
    case AGENT_MEMORY_LANE.TASK_KNOWLEDGE:
      return 'TASK_KNOWLEDGE'
    case AGENT_MEMORY_LANE.AGENT_PERSONALIZATION:
      return 'PROFILE'
  }
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
