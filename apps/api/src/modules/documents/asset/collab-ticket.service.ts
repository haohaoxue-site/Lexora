import type {
  CollabTicketPayload,
  ConsumeCollabTicketResponse,
  CreateCollabTicketResponse,
} from '@haohaoxue/samepage-contracts'
import type { CollabConfig } from '../../../config/collab.config'
import { randomBytes } from 'node:crypto'
import {
  COLLAB_ERROR_CODE,
  COLLAB_RUNTIME_ROLE,
} from '@haohaoxue/samepage-contracts'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../../../database/prisma.service'
import { sha256Hex } from '../../../utils/hash'
import { DocumentAccessService } from '../core/access.service'

interface CreateCollabTicketInput {
  userId: string
  documentId: string
  workspaceId: string
  runtimeRole: CollabTicketPayload['runtimeRole']
  canWrite: boolean
}

interface StoredCollabTicket {
  id: string
  userId: string
  documentId: string
  workspaceId: string
  runtimeRole: CollabTicketPayload['runtimeRole']
  canWrite: boolean
  runtimeEpoch: number
  expiresAt: Date
  consumedAt: Date | null
  deletedAt: Date | null
}

@Injectable()
export class DocumentCollabTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentAccessService: DocumentAccessService,
    private readonly configService: ConfigService,
  ) {}

  async createDocumentCollabTicket(userId: string, documentId: string): Promise<CreateCollabTicketResponse> {
    const document = await this.documentAccessService.assertCanEditDocument(userId, documentId)

    return await this.createCollabTicket({
      userId,
      documentId,
      workspaceId: document.workspaceId,
      runtimeRole: COLLAB_RUNTIME_ROLE.EDITOR,
      canWrite: true,
    })
  }

  async consumeDocumentCollabTicket(documentId: string, token: string): Promise<ConsumeCollabTicketResponse> {
    const now = new Date()
    const record = await this.prisma.documentCollabTicket.findUnique({
      where: {
        tokenHash: sha256Hex(token),
      },
      select: {
        id: true,
        userId: true,
        documentId: true,
        workspaceId: true,
        runtimeRole: true,
        canWrite: true,
        runtimeEpoch: true,
        expiresAt: true,
        consumedAt: true,
        deletedAt: true,
      },
    }) as StoredCollabTicket | null

    if (!record || record.deletedAt) {
      throw new DocumentCollabTicketConsumeError(COLLAB_ERROR_CODE.TICKET_INVALID)
    }

    if (record.documentId !== documentId) {
      throw new DocumentCollabTicketConsumeError(COLLAB_ERROR_CODE.DOCUMENT_MISMATCH)
    }

    if (record.consumedAt) {
      throw new DocumentCollabTicketConsumeError(COLLAB_ERROR_CODE.TICKET_REPLAYED)
    }

    if (record.expiresAt.getTime() <= now.getTime()) {
      throw new DocumentCollabTicketConsumeError(COLLAB_ERROR_CODE.TICKET_EXPIRED)
    }

    try {
      await this.documentAccessService.assertCanEditDocument(record.userId, record.documentId)
    }
    catch {
      throw new DocumentCollabTicketConsumeError(COLLAB_ERROR_CODE.PERMISSION_INVALIDATED)
    }

    const updated = await this.prisma.documentCollabTicket.updateMany({
      where: {
        id: record.id,
        consumedAt: null,
        deletedAt: null,
      },
      data: {
        consumedAt: now,
      },
    })

    if (updated.count !== 1) {
      throw new DocumentCollabTicketConsumeError(COLLAB_ERROR_CODE.TICKET_REPLAYED)
    }

    return {
      jti: record.id,
      userId: record.userId,
      documentId: record.documentId,
      workspaceId: record.workspaceId,
      runtimeRole: record.runtimeRole,
      canWrite: record.canWrite,
      runtimeEpoch: record.runtimeEpoch,
      expiresAt: record.expiresAt.toISOString(),
    }
  }

  private async createCollabTicket(input: CreateCollabTicketInput): Promise<CreateCollabTicketResponse> {
    const runtimeEpoch = await this.resolveRuntimeEpoch(input.documentId)
    const collabConfig = this.configService.getOrThrow<CollabConfig>('collab')
    const expiresAt = new Date(Date.now() + collabConfig.ticketTtlSeconds * 1_000)
    const rawToken = generateOpaqueCollabTicket()

    await this.prisma.documentCollabTicket.create({
      data: {
        documentId: input.documentId,
        userId: input.userId,
        workspaceId: input.workspaceId,
        tokenHash: sha256Hex(rawToken),
        runtimeRole: input.runtimeRole,
        canWrite: input.canWrite,
        runtimeEpoch,
        expiresAt,
      },
    })

    return {
      token: rawToken,
      expiresAt: expiresAt.toISOString(),
      runtimeEpoch,
      publicWsUrl: collabConfig.publicWsUrl,
    }
  }

  private async resolveRuntimeEpoch(documentId: string): Promise<number> {
    const ydoc = await this.prisma.documentYdoc.upsert({
      where: {
        documentId,
      },
      create: {
        documentId,
      },
      update: {},
      select: {
        runtimeEpoch: true,
      },
    })

    return ydoc.runtimeEpoch
  }
}

export class DocumentCollabTicketConsumeError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'DocumentCollabTicketConsumeError'
  }
}

function generateOpaqueCollabTicket(): string {
  return randomBytes(32).toString('base64url')
}
