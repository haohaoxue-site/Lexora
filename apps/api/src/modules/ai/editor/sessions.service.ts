import type {
  AgentEditorAiContext,
  AgentEditorAiRunContext,
  AgentRunCommand,
  AiAnchor,
  AiCandidate,
  AiEditorWorkflowKey,
  AiModelIntentKey,
  AiRun,
  AiSession,
  CreateAiEditorSessionRequest,
  CreateAiEditorSessionResponse,
  ResolveAiEditorCandidateResponse,
  TiptapJsonContent,
  TiptapJsonNode,
} from '@haohaoxue/samepage-contracts'
import { randomUUID } from 'node:crypto'
import {
  AGENT_WORKFLOW_KEY,
  AgentEditorAiRunContextSchema,
  AgentRunCommandSchema,
  AI_ANCHOR_KIND,
  AI_CANDIDATE_STATUS,
  AI_EDITOR_WORKFLOW_KEY,
  AI_MODEL_INTENT_KEY,
  AI_RUN_STATUS,
  AI_SESSION_STATUS,
  AiAnchorSchema,
  CreateAiEditorSessionRequestSchema,
  TIPTAP_BODY_BLOCK_ID_ATTRIBUTE,
} from '@haohaoxue/samepage-contracts'
import {
  buildDocumentBlockIndex,
  getDocumentPlainText,
  getDocumentTitlePlainText,
} from '@haohaoxue/samepage-shared'
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../database/prisma.service'
import { AgentRunCommandPublisherService } from '../../agent/agent-command-publisher.service'
import { DocumentContentService } from '../../documents/content/content.service'
import { DocumentAccessService } from '../../documents/core/access.service'
import { AiModelResolverService } from '../models/resolver.service'

interface PrepareEditorRunCommandInput {
  userId: string
  request: CreateAiEditorSessionRequest
}

interface PreparedEditorRunCommand extends CreateAiEditorSessionResponse {
  command: AgentRunCommand
}

interface CompleteEditorRunInput {
  userId: string
  sessionId: string
  runId: string
  contentText: string
}

interface MarkEditorRunFailedInput {
  userId: string
  sessionId: string
  runId: string
}

interface ResolveEditorCandidateInput {
  userId: string
  sessionId: string
  candidateId: string
}

interface GetAgentEditorContextInput {
  actorId: string
  sessionId: string
  aiRunId: string
}

const aiSessionSelect = {
  id: true,
  documentId: true,
  workflowKey: true,
  prompt: true,
  anchor: true,
  baseProjectionRevision: true,
  status: true,
  currentRunId: true,
  acceptedCandidateId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AiSessionSelect

const aiRunSelect = {
  id: true,
  sessionId: true,
  agentRunId: true,
  workflowKey: true,
  modelTargetSnapshot: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AiRunSelect

const aiCandidateSelect = {
  id: true,
  sessionId: true,
  runId: true,
  contentText: true,
  plainText: true,
  status: true,
  acceptedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AiCandidateSelect

type PersistedAiSession = Prisma.AiSessionGetPayload<{ select: typeof aiSessionSelect }>
type PersistedAiRun = Prisma.AiRunGetPayload<{ select: typeof aiRunSelect }>
type PersistedAiCandidate = Prisma.AiCandidateGetPayload<{ select: typeof aiCandidateSelect }>

@Injectable()
export class AiEditorSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentAccessService: DocumentAccessService,
    private readonly documentContentService: DocumentContentService,
    private readonly modelResolverService: AiModelResolverService,
    private readonly agentRunCommandPublisher: AgentRunCommandPublisherService,
  ) {}

  async prepareEditorRunCommand(input: PrepareEditorRunCommandInput): Promise<PreparedEditorRunCommand> {
    const request = CreateAiEditorSessionRequestSchema.parse(input.request)

    await this.documentAccessService.assertCanEditDocument(input.userId, request.anchor.documentId)
    const documentCurrent = await this.documentContentService.getDocumentCurrent(input.userId, request.anchor.documentId)
    this.assertAnchorMatchesCurrent(request.anchor, documentCurrent.currentProjection.body)
    const baseProjectionRevision = documentCurrent.currentProjection.projectionRevision

    const target = await this.modelResolverService.resolveModelTarget({
      actorUserId: input.userId,
      intentKey: resolveEditorIntentKey(request.workflowKey),
      requestedModelRef: request.requestedModelRef,
    })
    const agentRunId = randomUUID()
    const { run, session } = await this.prisma.$transaction(async (tx) => {
      const session = await tx.aiSession.create({
        data: {
          documentId: request.anchor.documentId,
          workflowKey: request.workflowKey,
          prompt: request.prompt,
          anchorKind: toPrismaAnchorKind(request.anchor.kind),
          anchor: toPrismaJsonValue(request.anchor),
          baseProjectionRevision,
          status: 'RUNNING',
          createdBy: input.userId,
        },
        select: aiSessionSelect,
      })
      const run = await tx.aiRun.create({
        data: {
          sessionId: session.id,
          agentRunId,
          workflowKey: request.workflowKey,
          modelTargetSnapshot: toPrismaJsonValue(toModelTargetSnapshot(target)),
          status: 'RUNNING',
          createdBy: input.userId,
        },
        select: aiRunSelect,
      })
      const updatedSession = await tx.aiSession.update({
        where: {
          id: session.id,
        },
        data: {
          currentRunId: run.id,
          updatedBy: input.userId,
        },
        select: aiSessionSelect,
      })

      return {
        session: updatedSession,
        run,
      }
    })
    const context: AgentEditorAiRunContext = AgentEditorAiRunContextSchema.parse({
      aiSessionId: session.id,
      aiRunId: run.id,
    })

    return {
      session: toAiSession(session),
      run: toAiRun(run),
      command: AgentRunCommandSchema.parse({
        commandId: randomUUID(),
        runId: run.agentRunId,
        workflowKey: request.workflowKey,
        actorId: input.userId,
        modelTarget: {
          providerId: target.providerId,
          scope: target.scope,
          providerKey: target.providerKey,
          adapterKey: target.adapterKey,
          endpoint: target.endpoint,
          apiKey: target.apiKey,
          authMode: target.authMode,
          modelId: target.modelId,
        },
        context,
        idempotencyKey: `${request.workflowKey}:${session.id}:${run.id}`,
      }),
    }
  }

  async submitEditorRunCommand(input: PrepareEditorRunCommandInput): Promise<PreparedEditorRunCommand> {
    const prepared = await this.prepareEditorRunCommand(input)

    try {
      await this.agentRunCommandPublisher.publishRunCommand(prepared.command)
    }
    catch (error) {
      try {
        await this.markEditorRunFailed({
          userId: input.userId,
          sessionId: prepared.session.sessionId,
          runId: prepared.run.runId,
        })
      }
      catch (statusError) {
        void statusError
      }
      throw error
    }

    return prepared
  }

  async completeEditorRunWithCandidate(input: CompleteEditorRunInput): Promise<AiCandidate> {
    const plainText = input.contentText.trim()

    if (!plainText) {
      throw new BadGatewayException('编辑器 AI 没有返回内容')
    }

    const candidate = await this.prisma.$transaction(async (tx) => {
      const run = await tx.aiRun.findFirst({
        where: {
          id: input.runId,
          sessionId: input.sessionId,
        },
        select: {
          id: true,
        },
      })

      if (!run) {
        throw new NotFoundException(`AI run "${input.runId}" not found`)
      }

      const candidate = await tx.aiCandidate.create({
        data: {
          sessionId: input.sessionId,
          runId: input.runId,
          contentText: input.contentText,
          plainText,
          status: 'COMPLETED',
          createdBy: input.userId,
        },
        select: aiCandidateSelect,
      })

      await tx.aiRun.update({
        where: {
          id: input.runId,
        },
        data: {
          status: 'COMPLETED',
          updatedBy: input.userId,
        },
      })
      await tx.aiSession.update({
        where: {
          id: input.sessionId,
        },
        data: {
          status: 'READY',
          updatedBy: input.userId,
        },
      })

      return candidate
    })

    return toAiCandidate(candidate)
  }

  async markEditorRunFailed(input: MarkEditorRunFailedInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.aiRun.updateMany({
        where: {
          id: input.runId,
          sessionId: input.sessionId,
        },
        data: {
          status: 'FAILED',
          updatedBy: input.userId,
        },
      })
      await tx.aiSession.update({
        where: {
          id: input.sessionId,
        },
        data: {
          status: 'FAILED',
          updatedBy: input.userId,
        },
      })
    })
  }

  async acceptEditorCandidate(input: ResolveEditorCandidateInput): Promise<ResolveAiEditorCandidateResponse> {
    const session = await this.prisma.aiSession.findFirst({
      where: {
        id: input.sessionId,
        createdBy: input.userId,
        deletedAt: null,
      },
      select: {
        documentId: true,
      },
    })

    if (!session) {
      throw new NotFoundException(`AI session "${input.sessionId}" not found`)
    }

    await this.documentAccessService.assertCanEditDocument(input.userId, session.documentId)

    return this.resolveEditorCandidate(input, 'accept')
  }

  async rejectEditorCandidate(input: ResolveEditorCandidateInput): Promise<ResolveAiEditorCandidateResponse> {
    return this.resolveEditorCandidate(input, 'reject')
  }

  async getAgentEditorContext(input: GetAgentEditorContextInput): Promise<AgentEditorAiContext> {
    const session = await this.prisma.aiSession.findFirst({
      where: {
        id: input.sessionId,
        createdBy: input.actorId,
        deletedAt: null,
      },
      select: {
        ...aiSessionSelect,
        runs: {
          where: {
            id: input.aiRunId,
            deletedAt: null,
          },
          select: aiRunSelect,
          take: 1,
        },
      },
    })

    if (!session || !session.runs[0]) {
      throw new NotFoundException(`AI session "${input.sessionId}" not found`)
    }

    const current = await this.documentContentService.getDocumentCurrent(input.actorId, session.documentId)
    const currentProjectionRevision = current.currentProjection.projectionRevision

    if (currentProjectionRevision !== session.baseProjectionRevision) {
      throw new ConflictException('编辑器 AI 锚点对应的文档版本已变化')
    }

    const anchor = AiAnchorSchema.parse(session.anchor)
    const blockIndex = buildDocumentBlockIndex(current.currentProjection.body)
    const anchorBlock = blockIndex.find(entry => entry.blockId === anchor.blockId)

    if (!anchorBlock) {
      throw new NotFoundException(`AI anchor block "${anchor.blockId}" not found`)
    }

    return {
      sessionId: session.id,
      aiRunId: session.runs[0].id,
      documentId: session.documentId,
      workflowKey: toEditorWorkflowKey(session.workflowKey),
      prompt: session.prompt,
      anchor,
      documentTitle: getDocumentTitlePlainText(current.currentProjection.title),
      documentPlainText: getDocumentPlainText(current.currentProjection.body),
      anchorBlockPlainText: anchorBlock.plainText,
      baseProjectionRevision: session.baseProjectionRevision,
      currentProjectionRevision,
    }
  }

  private assertAnchorMatchesCurrent(anchor: AiAnchor, body: TiptapJsonContent): void {
    const block = buildDocumentBlockIndex(body).find(entry => entry.blockId === anchor.blockId)
    const rawBlockText = getTiptapBlockRawText(body, anchor.blockId)

    if (!block || rawBlockText === null) {
      throw new BadRequestException(`AI anchor block "${anchor.blockId}" not found`)
    }

    if (anchor.kind === AI_ANCHOR_KIND.BLOCK_INSERT && rawBlockText.trim()) {
      throw new BadRequestException('空行生成只能作用于空 block')
    }

    if (anchor.kind === AI_ANCHOR_KIND.TEXT_SELECTION) {
      const selectedText = rawBlockText.slice(anchor.from, anchor.to)
      if (selectedText !== anchor.selectedText) {
        throw new BadRequestException('选区文本与当前文档不匹配')
      }
    }
  }

  private async resolveEditorCandidate(
    input: ResolveEditorCandidateInput,
    resolution: 'accept' | 'reject',
  ): Promise<ResolveAiEditorCandidateResponse> {
    const resolved = await this.prisma.$transaction(async (tx) => {
      const session = await tx.aiSession.findFirst({
        where: {
          id: input.sessionId,
          createdBy: input.userId,
          deletedAt: null,
        },
        select: aiSessionSelect,
      })

      if (!session) {
        throw new NotFoundException(`AI session "${input.sessionId}" not found`)
      }

      const candidate = await tx.aiCandidate.findFirst({
        where: {
          id: input.candidateId,
          sessionId: input.sessionId,
          createdBy: input.userId,
          deletedAt: null,
        },
        select: aiCandidateSelect,
      })

      if (!candidate) {
        throw new NotFoundException(`AI candidate "${input.candidateId}" not found`)
      }

      if (session.status !== 'READY' || candidate.status !== 'COMPLETED') {
        throw new ConflictException('编辑器 AI 候选已处理或尚未就绪')
      }

      const accepted = resolution === 'accept'
      const updatedCandidateResult = await tx.aiCandidate.updateMany({
        where: {
          id: input.candidateId,
          sessionId: input.sessionId,
          createdBy: input.userId,
          status: 'COMPLETED',
          deletedAt: null,
        },
        data: {
          status: accepted ? 'ACCEPTED' : 'REJECTED',
          acceptedAt: accepted ? new Date() : null,
          updatedBy: input.userId,
        },
      })

      if (updatedCandidateResult.count !== 1) {
        throw new ConflictException('编辑器 AI 候选已处理或尚未就绪')
      }

      const updatedSessionResult = await tx.aiSession.updateMany({
        where: {
          id: input.sessionId,
          createdBy: input.userId,
          status: 'READY',
          deletedAt: null,
        },
        data: {
          status: accepted ? 'ACCEPTED' : 'REJECTED',
          acceptedCandidateId: accepted ? input.candidateId : null,
          updatedBy: input.userId,
        },
      })

      if (updatedSessionResult.count !== 1) {
        throw new ConflictException('编辑器 AI 候选已处理或尚未就绪')
      }

      const updatedCandidate = await tx.aiCandidate.findFirst({
        where: {
          id: input.candidateId,
        },
        select: aiCandidateSelect,
      })
      const updatedSession = await tx.aiSession.findFirst({
        where: {
          id: input.sessionId,
        },
        select: aiSessionSelect,
      })

      if (!updatedCandidate || !updatedSession) {
        throw new ConflictException('编辑器 AI 候选已处理或尚未就绪')
      }

      return {
        session: updatedSession,
        candidate: updatedCandidate,
      }
    })

    return {
      session: toAiSession(resolved.session),
      candidate: toAiCandidate(resolved.candidate),
    }
  }
}

function getTiptapBlockRawText(content: TiptapJsonContent, blockId: string): string | null {
  const block = findTiptapBlockNode(content, blockId)

  return block ? getTiptapNodeRawText(block) : null
}

function findTiptapBlockNode(content: TiptapJsonContent | undefined, blockId: string): TiptapJsonNode | null {
  if (!Array.isArray(content)) {
    return null
  }

  for (const node of content) {
    if (!isTiptapJsonNode(node)) {
      continue
    }

    if (readTiptapBlockId(node) === blockId) {
      return node
    }

    const childBlock = findTiptapBlockNode(node.content, blockId)
    if (childBlock) {
      return childBlock
    }
  }

  return null
}

function getTiptapNodeRawText(node: TiptapJsonNode): string {
  if (typeof node.text === 'string') {
    return node.text
  }

  if (node.type === 'hardBreak') {
    return '\n'
  }

  if (!Array.isArray(node.content)) {
    return ''
  }

  return node.content
    .filter(isTiptapJsonNode)
    .map(child => getTiptapNodeRawText(child))
    .join('')
}

function readTiptapBlockId(node: TiptapJsonNode): string | null {
  const attrs = node.attrs

  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) {
    return null
  }

  const blockId = (attrs as Record<string, unknown>)[TIPTAP_BODY_BLOCK_ID_ATTRIBUTE]
  return typeof blockId === 'string' && blockId ? blockId : null
}

function isTiptapJsonNode(value: unknown): value is TiptapJsonNode {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function resolveEditorIntentKey(workflowKey: AiEditorWorkflowKey): AiModelIntentKey {
  switch (workflowKey) {
    case AI_EDITOR_WORKFLOW_KEY.GENERATE:
      return AI_MODEL_INTENT_KEY.DOCUMENT_GENERATE_DEFAULT
    case AI_EDITOR_WORKFLOW_KEY.REWRITE:
      return AI_MODEL_INTENT_KEY.DOCUMENT_REWRITE_DEFAULT
  }
}

function toModelTargetSnapshot(target: {
  providerId: string
  scope: string
  providerKey: string
  providerName: string
  adapterKey: string
  endpoint: string
  authMode: string
  modelId: string
  modelName: string
}) {
  return {
    providerId: target.providerId,
    scope: target.scope,
    providerKey: target.providerKey,
    providerName: target.providerName,
    adapterKey: target.adapterKey,
    endpoint: target.endpoint,
    authMode: target.authMode,
    modelId: target.modelId,
    modelName: target.modelName,
  }
}

function toPrismaAnchorKind(kind: AiAnchor['kind']) {
  return kind === AI_ANCHOR_KIND.BLOCK_INSERT ? 'BLOCK_INSERT' : 'TEXT_SELECTION'
}

function toAiSession(session: PersistedAiSession): AiSession {
  return {
    sessionId: session.id,
    documentId: session.documentId,
    workflowKey: toEditorWorkflowKey(session.workflowKey),
    prompt: session.prompt,
    anchor: AiAnchorSchema.parse(session.anchor),
    baseProjectionRevision: session.baseProjectionRevision,
    status: toSessionStatus(session.status),
    currentRunId: session.currentRunId,
    acceptedCandidateId: session.acceptedCandidateId,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  }
}

function toAiRun(run: PersistedAiRun): AiRun {
  return {
    runId: run.id,
    sessionId: run.sessionId,
    agentRunId: run.agentRunId,
    workflowKey: toEditorWorkflowKey(run.workflowKey),
    modelTargetSnapshot: toJsonRecord(run.modelTargetSnapshot),
    status: toRunStatus(run.status),
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  }
}

function toAiCandidate(candidate: PersistedAiCandidate): AiCandidate {
  return {
    candidateId: candidate.id,
    sessionId: candidate.sessionId,
    runId: candidate.runId,
    contentText: candidate.contentText,
    plainText: candidate.plainText,
    status: toCandidateStatus(candidate.status),
    acceptedAt: candidate.acceptedAt?.toISOString() ?? null,
    createdAt: candidate.createdAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString(),
  }
}

function toEditorWorkflowKey(workflowKey: string) {
  if (workflowKey === AGENT_WORKFLOW_KEY.EDITOR_GENERATE) {
    return AI_EDITOR_WORKFLOW_KEY.GENERATE
  }
  if (workflowKey === AGENT_WORKFLOW_KEY.EDITOR_REWRITE) {
    return AI_EDITOR_WORKFLOW_KEY.REWRITE
  }

  throw new BadRequestException(`Unsupported editor workflowKey: ${workflowKey}`)
}

function toSessionStatus(status: string) {
  switch (status) {
    case 'PENDING':
      return AI_SESSION_STATUS.PENDING
    case 'RUNNING':
      return AI_SESSION_STATUS.RUNNING
    case 'READY':
      return AI_SESSION_STATUS.READY
    case 'ACCEPTED':
      return AI_SESSION_STATUS.ACCEPTED
    case 'REJECTED':
      return AI_SESSION_STATUS.REJECTED
    default:
      return AI_SESSION_STATUS.FAILED
  }
}

function toRunStatus(status: string) {
  switch (status) {
    case 'PENDING':
      return AI_RUN_STATUS.PENDING
    case 'RUNNING':
      return AI_RUN_STATUS.RUNNING
    case 'COMPLETED':
      return AI_RUN_STATUS.COMPLETED
    default:
      return AI_RUN_STATUS.FAILED
  }
}

function toCandidateStatus(status: string) {
  switch (status) {
    case 'ACCEPTED':
      return AI_CANDIDATE_STATUS.ACCEPTED
    case 'REJECTED':
      return AI_CANDIDATE_STATUS.REJECTED
    default:
      return AI_CANDIDATE_STATUS.COMPLETED
  }
}

function toJsonRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function toPrismaJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}
