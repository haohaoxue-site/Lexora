import type {
  DocumentCurrent,
  DocumentShare,
  DocumentShareAccess,
  DocumentShareRecipient,
  DocumentShareRecipientSummary,
} from '@haohaoxue/samepage-contracts'
import type {
  PersistedDocumentShare,
  PersistedDocumentShareRecipient,
  PersistedDocumentShareRecipientRecord,
  PersistedSharedDocumentPreview,
} from './shares.utils'
import {
  DOCUMENT_SHARE_ACCESS_SOURCE,
  DOCUMENT_SHARE_MODE,
  DOCUMENT_SHARE_PERMISSION,
  DOCUMENT_SHARE_RECIPIENT_STATUS,
  DOCUMENT_SHARE_STATUS,
} from '@haohaoxue/samepage-contracts'
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../database/prisma.service'
import { DocumentAccessService } from '../core/access.service'
import { DocumentShareAccessService } from './share-access.service'
import {
  buildSharedDocumentCurrent,
  documentShareRecipientRecordSelect,
  documentShareRecipientSelect,
  documentShareSelect,
  documentShareTreeNodeSelect,
  sharedDocumentCurrentSelect,
  sharedDocumentPreviewSelect,
  toDocumentPublicShare,
  toDocumentShare,
  toDocumentShareAccess,
  toDocumentShareRecipient,
  toDocumentShareRecipientSummary,
  toUserCollabIdentity,
} from './shares.utils'

@Injectable()
export class DocumentShareRecipientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentAccessService: DocumentAccessService,
    private readonly documentShareAccessService: DocumentShareAccessService,
  ) {}

  async resolveActiveShareRecipientIds(userId: string, recipientIds: string[]): Promise<Set<string>> {
    if (recipientIds.length === 0) {
      return new Set()
    }

    const recipients = await this.prisma.documentShareRecipient.findMany({
      where: {
        id: {
          in: Array.from(new Set(recipientIds)),
        },
        recipientUserId: userId,
        status: DOCUMENT_SHARE_RECIPIENT_STATUS.ACTIVE,
        documentShare: {
          status: DOCUMENT_SHARE_STATUS.ACTIVE,
        },
      },
      select: {
        id: true,
      },
    })

    return new Set(recipients.map(recipient => recipient.id))
  }

  async resolveActiveShareIds(userId: string, shareIds: string[]): Promise<Set<string>> {
    if (shareIds.length === 0) {
      return new Set()
    }

    const uniqueShareIds = Array.from(
      new Set(
        shareIds
          .map(shareId => shareId.trim())
          .filter(shareId => shareId.length > 0),
      ),
    )
    const accessibleShareIds = await Promise.all(uniqueShareIds.map(async (shareId) => {
      try {
        await this.assertAccessibleShareRoute(userId, shareId)
        return shareId
      }
      catch (error) {
        if (error instanceof ForbiddenException || error instanceof NotFoundException) {
          return null
        }

        throw error
      }
    }))

    return new Set(accessibleShareIds.filter((shareId): shareId is string => shareId !== null))
  }

  async getPendingRecipients(userId: string): Promise<DocumentShareRecipientSummary[]> {
    return (await this.listRecipientRecordsByStatus(userId, DOCUMENT_SHARE_RECIPIENT_STATUS.PENDING))
      .map(record => toDocumentShareRecipientSummary(record))
  }

  async getActiveRecipients(userId: string): Promise<DocumentShareRecipientSummary[]> {
    return (await this.listRecipientRecordsByStatus(userId, DOCUMENT_SHARE_RECIPIENT_STATUS.ACTIVE))
      .map(record => toDocumentShareRecipientSummary(record))
  }

  async getShareAccess(userId: string | null, shareId: string): Promise<DocumentShareAccess> {
    const shareRecord = await this.assertActivePublicShareRecord(shareId)
    const document = await this.loadSharedDocumentPreview(shareRecord.documentId)
    const share = toDocumentPublicShare(shareRecord)
    const sharedByUser = toUserCollabIdentity(shareRecord.createdByUser)

    await this.assertEntryShareStillAuthorizesDocument({
      entryShareId: shareRecord.id,
      documentId: document.id,
      workspaceId: document.workspaceId,
    })

    if (userId && await this.documentAccessService.hasWorkspaceAccess(userId, document.workspaceId)) {
      await this.removeWorkspaceShareRecipientsForJoinedMember({
        workspaceId: document.workspaceId,
        userId,
      })

      return toDocumentShareAccess({
        accessSource: DOCUMENT_SHARE_ACCESS_SOURCE.WORKSPACE_MEMBER,
        authorizationRootDocumentId: shareRecord.documentId,
        authorizationShareId: shareRecord.id,
        authorizationRecipientId: null,
        entryShareId: shareRecord.id,
        entryRecipientId: null,
        canEditTree: true,
        share,
        recipient: null,
        recipientStatus: DOCUMENT_SHARE_RECIPIENT_STATUS.ACTIVE,
        sharedByUser,
        document,
      })
    }

    if (share.mode === DOCUMENT_SHARE_MODE.PUBLIC) {
      return toDocumentShareAccess({
        accessSource: DOCUMENT_SHARE_ACCESS_SOURCE.PUBLIC_SHARE,
        authorizationRootDocumentId: shareRecord.documentId,
        authorizationShareId: shareRecord.id,
        authorizationRecipientId: null,
        entryShareId: shareRecord.id,
        entryRecipientId: null,
        share,
        recipient: null,
        recipientStatus: DOCUMENT_SHARE_RECIPIENT_STATUS.ACTIVE,
        sharedByUser,
        document,
      })
    }

    if (!userId) {
      throw new UnauthorizedException('请先登录后查看该分享')
    }

    const existingRecipient = await this.findShareRecipientByUser({
      shareId: share.id,
      userId,
    })
    const visibleRecipient = existingRecipient?.status === DOCUMENT_SHARE_RECIPIENT_STATUS.REMOVED
      ? null
      : existingRecipient

    return toDocumentShareAccess({
      accessSource: DOCUMENT_SHARE_ACCESS_SOURCE.PUBLIC_SHARE,
      authorizationRootDocumentId: shareRecord.documentId,
      authorizationShareId: shareRecord.id,
      authorizationRecipientId: visibleRecipient?.id ?? null,
      entryShareId: shareRecord.id,
      entryRecipientId: null,
      share,
      recipient: visibleRecipient ? toDocumentShareRecipient(visibleRecipient) : null,
      recipientStatus: visibleRecipient?.status ?? DOCUMENT_SHARE_RECIPIENT_STATUS.PENDING,
      sharedByUser,
      document,
    })
  }

  async acceptShare(userId: string, shareId: string): Promise<DocumentShareAccess> {
    const shareRecord = await this.assertActivePublicShareRecord(shareId)
    const document = await this.loadSharedDocumentPreview(shareRecord.documentId)
    const share = toDocumentPublicShare(shareRecord)
    const sharedByUser = toUserCollabIdentity(shareRecord.createdByUser)

    await this.assertEntryShareStillAuthorizesDocument({
      entryShareId: shareRecord.id,
      documentId: document.id,
      workspaceId: document.workspaceId,
    })

    if (await this.documentAccessService.hasWorkspaceAccess(userId, document.workspaceId)) {
      await this.removeWorkspaceShareRecipientsForJoinedMember({
        workspaceId: document.workspaceId,
        userId,
      })

      return toDocumentShareAccess({
        accessSource: DOCUMENT_SHARE_ACCESS_SOURCE.WORKSPACE_MEMBER,
        authorizationRootDocumentId: shareRecord.documentId,
        authorizationShareId: shareRecord.id,
        authorizationRecipientId: null,
        entryShareId: shareRecord.id,
        entryRecipientId: null,
        canEditTree: true,
        share,
        recipient: null,
        recipientStatus: DOCUMENT_SHARE_RECIPIENT_STATUS.ACTIVE,
        sharedByUser,
        document,
      })
    }

    if (share.mode === DOCUMENT_SHARE_MODE.PUBLIC) {
      return toDocumentShareAccess({
        accessSource: DOCUMENT_SHARE_ACCESS_SOURCE.PUBLIC_SHARE,
        authorizationRootDocumentId: shareRecord.documentId,
        authorizationShareId: shareRecord.id,
        authorizationRecipientId: null,
        entryShareId: shareRecord.id,
        entryRecipientId: null,
        share,
        recipient: null,
        recipientStatus: DOCUMENT_SHARE_RECIPIENT_STATUS.ACTIVE,
        sharedByUser,
        document,
      })
    }

    const recipient = await this.ensureRecipientState({
      shareId: share.id,
      userId,
      nextStatus: DOCUMENT_SHARE_RECIPIENT_STATUS.ACTIVE,
    })

    return toDocumentShareAccess({
      accessSource: DOCUMENT_SHARE_ACCESS_SOURCE.PUBLIC_SHARE,
      authorizationRootDocumentId: shareRecord.documentId,
      authorizationShareId: shareRecord.id,
      authorizationRecipientId: recipient.id,
      entryShareId: shareRecord.id,
      entryRecipientId: null,
      share,
      recipient,
      recipientStatus: recipient.status,
      sharedByUser,
      document,
    })
  }

  async declineShare(userId: string, shareId: string): Promise<DocumentShareAccess> {
    const shareRecord = await this.assertActivePublicShareRecord(shareId)
    const document = await this.loadSharedDocumentPreview(shareRecord.documentId)
    const share = toDocumentPublicShare(shareRecord)
    const sharedByUser = toUserCollabIdentity(shareRecord.createdByUser)

    await this.assertEntryShareStillAuthorizesDocument({
      entryShareId: shareRecord.id,
      documentId: document.id,
      workspaceId: document.workspaceId,
    })

    if (await this.documentAccessService.hasWorkspaceAccess(userId, document.workspaceId)) {
      await this.removeWorkspaceShareRecipientsForJoinedMember({
        workspaceId: document.workspaceId,
        userId,
      })

      return toDocumentShareAccess({
        accessSource: DOCUMENT_SHARE_ACCESS_SOURCE.WORKSPACE_MEMBER,
        authorizationRootDocumentId: shareRecord.documentId,
        authorizationShareId: shareRecord.id,
        authorizationRecipientId: null,
        entryShareId: shareRecord.id,
        entryRecipientId: null,
        canEditTree: true,
        share,
        recipient: null,
        recipientStatus: DOCUMENT_SHARE_RECIPIENT_STATUS.ACTIVE,
        sharedByUser,
        document,
      })
    }

    if (share.mode === DOCUMENT_SHARE_MODE.PUBLIC) {
      return toDocumentShareAccess({
        accessSource: DOCUMENT_SHARE_ACCESS_SOURCE.PUBLIC_SHARE,
        authorizationRootDocumentId: shareRecord.documentId,
        authorizationShareId: shareRecord.id,
        authorizationRecipientId: null,
        entryShareId: shareRecord.id,
        entryRecipientId: null,
        share,
        recipient: null,
        recipientStatus: DOCUMENT_SHARE_RECIPIENT_STATUS.ACTIVE,
        sharedByUser,
        document,
      })
    }

    const recipient = await this.ensureRecipientState({
      shareId: share.id,
      userId,
      nextStatus: DOCUMENT_SHARE_RECIPIENT_STATUS.DECLINED,
    })

    return toDocumentShareAccess({
      accessSource: DOCUMENT_SHARE_ACCESS_SOURCE.PUBLIC_SHARE,
      authorizationRootDocumentId: shareRecord.documentId,
      authorizationShareId: shareRecord.id,
      authorizationRecipientId: recipient.id,
      entryShareId: shareRecord.id,
      entryRecipientId: null,
      share,
      recipient,
      recipientStatus: recipient.status,
      sharedByUser,
      document,
    })
  }

  async getRecipientAccess(userId: string, recipientId: string): Promise<DocumentShareAccess> {
    const record = await this.assertAccessibleRecipientRecord(userId, recipientId)
    this.assertDirectRecipientShare(record)
    const document = record.documentShare.document

    await this.assertEntryShareStillAuthorizesDocument({
      entryShareId: record.documentShareId,
      documentId: document.id,
      workspaceId: document.workspaceId,
    })

    return toDocumentShareAccess({
      accessSource: DOCUMENT_SHARE_ACCESS_SOURCE.DIRECT_SHARE,
      authorizationRootDocumentId: record.documentShare.documentId,
      authorizationShareId: record.documentShareId,
      authorizationRecipientId: record.id,
      entryShareId: null,
      entryRecipientId: record.id,
      share: toDocumentShare(record.documentShare),
      recipient: toDocumentShareRecipient(record),
      recipientStatus: record.status as DocumentShareRecipient['status'],
      sharedByUser: toUserCollabIdentity(record.documentShare.createdByUser),
      document,
    })
  }

  async acceptRecipientShare(userId: string, recipientId: string): Promise<DocumentShareAccess> {
    const record = await this.assertAccessibleRecipientRecord(userId, recipientId)
    this.assertDirectRecipientShare(record)

    await this.prisma.documentShareRecipient.update({
      where: {
        id: record.id,
      },
      data: {
        status: DOCUMENT_SHARE_RECIPIENT_STATUS.ACTIVE,
        updatedBy: userId,
      },
      select: documentShareRecipientSelect,
    })

    return this.getRecipientAccess(userId, recipientId)
  }

  async declineRecipientShare(userId: string, recipientId: string): Promise<DocumentShareAccess> {
    const record = await this.assertAccessibleRecipientRecord(userId, recipientId)
    this.assertDirectRecipientShare(record)

    await this.prisma.documentShareRecipient.update({
      where: {
        id: record.id,
      },
      data: {
        status: DOCUMENT_SHARE_RECIPIENT_STATUS.DECLINED,
        updatedBy: userId,
      },
      select: documentShareRecipientSelect,
    })

    return this.getRecipientAccess(userId, recipientId)
  }

  async removeWorkspaceShareRecipientsForJoinedMember(
    input: {
      workspaceId: string
      userId: string
    },
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const recipients = await db.documentShareRecipient.findMany({
      where: {
        recipientUserId: input.userId,
        status: {
          not: DOCUMENT_SHARE_RECIPIENT_STATUS.REMOVED,
        },
        documentShare: {
          is: {
            document: {
              is: {
                workspaceId: input.workspaceId,
              },
            },
          },
        },
      },
      select: {
        id: true,
      },
    })

    if (!recipients.length) {
      return
    }

    await db.documentShareRecipient.updateMany({
      where: {
        id: {
          in: recipients.map(recipient => recipient.id),
        },
      },
      data: {
        status: DOCUMENT_SHARE_RECIPIENT_STATUS.REMOVED,
        updatedBy: input.userId,
      },
    })
  }

  async exitRecipientShare(userId: string, recipientId: string): Promise<DocumentShareAccess> {
    const record = await this.assertAccessibleRecipientRecord(userId, recipientId)

    if (record.status !== DOCUMENT_SHARE_RECIPIENT_STATUS.EXITED) {
      await this.prisma.documentShareRecipient.update({
        where: {
          id: record.id,
        },
        data: {
          status: DOCUMENT_SHARE_RECIPIENT_STATUS.EXITED,
          updatedBy: userId,
        },
        select: documentShareRecipientSelect,
      })
    }

    return this.getRecipientAccess(userId, recipientId)
  }

  async getSharedDocumentCurrent(userId: string | null, shareId: string, documentId?: string): Promise<DocumentCurrent> {
    const access = await this.documentShareAccessService.resolvePublicEntry({
      userId,
      shareId,
      documentId,
      action: 'read',
    })

    return this.loadSharedDocumentCurrentByDocumentId(access.document.id)
  }

  async getSharedRecipientDocumentCurrent(
    userId: string,
    recipientId: string,
    documentId?: string,
  ): Promise<DocumentCurrent> {
    const access = await this.documentShareAccessService.resolveRecipientEntry({
      userId,
      recipientId,
      documentId,
      action: 'read',
    })
    return this.loadSharedDocumentCurrentByDocumentId(access.document.id)
  }

  async assertCanReadSharedDocument(
    userId: string | null,
    shareId: string,
    documentId?: string,
  ): Promise<DocumentShare> {
    const access = await this.documentShareAccessService.resolvePublicEntry({
      userId,
      shareId,
      documentId,
      action: 'read',
    })

    if (!access.share) {
      throw new NotFoundException('该分享已失效')
    }

    return {
      ...toDocumentShare(access.share),
      documentId: access.document.id,
    }
  }

  async assertCanReadSharedRecipientDocument(
    userId: string,
    recipientId: string,
    documentId?: string,
  ): Promise<DocumentShareRecipientSummary> {
    const access = await this.documentShareAccessService.resolveRecipientEntry({
      userId,
      recipientId,
      documentId,
      action: 'read',
    })

    if (!access.recipientRecord) {
      throw new NotFoundException('该分享已失效')
    }

    return {
      ...toDocumentShareRecipientSummary(access.recipientRecord),
      documentId: access.document.id,
      documentTitle: access.document.title,
      workspaceName: access.document.workspace.name,
      workspaceType: access.document.workspace.type as DocumentShareRecipientSummary['workspaceType'],
    }
  }

  private async loadSharedDocumentCurrentByDocumentId(documentId: string): Promise<DocumentCurrent> {
    const [document, activeShares] = await Promise.all([
      this.prisma.document.findUnique({
        where: {
          id: documentId,
        },
        select: sharedDocumentCurrentSelect,
      }),
      this.prisma.documentShare.findMany({
        where: {
          documentId,
          status: DOCUMENT_SHARE_STATUS.ACTIVE,
        },
        select: documentShareSelect,
      }),
    ])

    if (document?.trashedAt) {
      throw new NotFoundException('该分享暂时不可用')
    }

    if (!document?.currentProjection) {
      throw new NotFoundException(`Document "${documentId}" current projection not found`)
    }

    return buildSharedDocumentCurrent(document, activeShares)
  }

  private async listRecipientRecordsByStatus(
    userId: string,
    status: DocumentShareRecipient['status'],
  ): Promise<PersistedDocumentShareRecipientRecord[]> {
    const records = await this.prisma.documentShareRecipient.findMany({
      where: {
        recipientUserId: userId,
        status,
        documentShare: {
          status: DOCUMENT_SHARE_STATUS.ACTIVE,
          document: {
            trashedAt: null,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: documentShareRecipientRecordSelect,
    })

    return records.filter(record => !record.documentShare.document.trashedAt)
  }

  private async assertAccessibleShareRoute(userId: string, shareId: string): Promise<void> {
    const share = await this.prisma.documentShare.findFirst({
      where: {
        id: shareId,
        status: DOCUMENT_SHARE_STATUS.ACTIVE,
      },
      select: documentShareSelect,
    })

    if (!share || share.mode === DOCUMENT_SHARE_MODE.NONE) {
      throw new NotFoundException('该分享已失效')
    }

    if (share.mode !== DOCUMENT_SHARE_MODE.DIRECT_USER) {
      await this.documentShareAccessService.resolvePublicEntry({
        userId,
        shareId,
        action: 'read',
      })
      return
    }

    const document = await this.loadSharedDocumentPreview(share.documentId)

    if (await this.documentAccessService.hasWorkspaceAccess(userId, document.workspaceId)) {
      return
    }

    const recipient = await this.prisma.documentShareRecipient.findUnique({
      where: {
        documentShareId_recipientUserId: {
          documentShareId: share.id,
          recipientUserId: userId,
        },
      },
      select: documentShareRecipientSelect,
    })

    if (!recipient || recipient.status !== DOCUMENT_SHARE_RECIPIENT_STATUS.ACTIVE) {
      throw new ForbiddenException('尚未接收该分享')
    }
  }

  private async assertEntryShareStillAuthorizesDocument(input: {
    entryShareId: string
    documentId: string
    workspaceId: string
  }) {
    const nearestShare = await this.findNearestActiveShareForDocument(input)

    if (!nearestShare || nearestShare.id !== input.entryShareId) {
      throw new NotFoundException('该分享已失效')
    }

    if (nearestShare.mode === DOCUMENT_SHARE_MODE.NONE) {
      throw new NotFoundException('该分享已失效')
    }
  }

  private async findNearestActiveShareForDocument(input: {
    documentId: string
    workspaceId: string
  }): Promise<PersistedDocumentShare | null> {
    let currentDocumentId: string | null = input.documentId

    while (currentDocumentId) {
      const [document, share] = await Promise.all([
        this.prisma.document.findUnique({
          where: {
            id: currentDocumentId,
          },
          select: documentShareTreeNodeSelect,
        }),
        this.prisma.documentShare.findFirst({
          where: {
            documentId: currentDocumentId,
            status: DOCUMENT_SHARE_STATUS.ACTIVE,
          },
          orderBy: {
            updatedAt: 'desc',
          },
          select: documentShareSelect,
        }),
      ])

      if (
        !document
        || document.workspaceId !== input.workspaceId
        || document.trashedAt !== null
      ) {
        throw new NotFoundException(`Document "${currentDocumentId}" not found`)
      }

      if (share) {
        return share
      }

      currentDocumentId = document.parentId
    }

    return null
  }

  private async assertActivePublicShareRecord(shareId: string): Promise<PersistedDocumentShare> {
    const share = await this.prisma.documentShare.findFirst({
      where: {
        id: shareId,
        mode: {
          in: [
            DOCUMENT_SHARE_MODE.LOGGED_IN,
            DOCUMENT_SHARE_MODE.PUBLIC,
          ],
        },
        status: DOCUMENT_SHARE_STATUS.ACTIVE,
      },
      select: documentShareSelect,
    })

    if (!share) {
      throw new NotFoundException('该分享已失效')
    }

    return share
  }

  private async loadRecipientRecordById(recipientId: string): Promise<PersistedDocumentShareRecipientRecord> {
    const recipient = await this.prisma.documentShareRecipient.findUnique({
      where: {
        id: recipientId,
      },
      select: documentShareRecipientRecordSelect,
    })

    if (!recipient) {
      throw new NotFoundException('该分享已失效')
    }

    if (recipient.documentShare.document.trashedAt) {
      throw new NotFoundException('该分享暂时不可用')
    }

    return recipient
  }

  private async assertAccessibleRecipientRecord(
    userId: string,
    recipientId: string,
  ): Promise<PersistedDocumentShareRecipientRecord> {
    const recipient = await this.loadRecipientRecordById(recipientId)

    if (recipient.recipientUserId !== userId) {
      throw new ForbiddenException('该分享不属于你')
    }

    if (
      recipient.status === DOCUMENT_SHARE_RECIPIENT_STATUS.REMOVED
      || recipient.documentShare.status !== DOCUMENT_SHARE_STATUS.ACTIVE
    ) {
      throw new NotFoundException('该分享已失效')
    }

    return recipient
  }

  private assertDirectRecipientShare(recipient: PersistedDocumentShareRecipientRecord) {
    if (recipient.documentShare.mode !== DOCUMENT_SHARE_MODE.DIRECT_USER) {
      throw new NotFoundException('该分享已失效')
    }
  }

  private async loadSharedDocumentPreview(documentId: string): Promise<PersistedSharedDocumentPreview> {
    const document = await this.prisma.document.findUnique({
      where: {
        id: documentId,
      },
      select: sharedDocumentPreviewSelect,
    })

    if (!document) {
      throw new NotFoundException(`Document "${documentId}" not found`)
    }

    if (document.trashedAt) {
      throw new NotFoundException('该分享暂时不可用')
    }

    return document
  }

  private async ensureRecipientState(input: {
    shareId: string
    userId: string
    nextStatus: DocumentShareRecipient['status']
  }): Promise<DocumentShareRecipient> {
    const existingRecipient = await this.prisma.documentShareRecipient.findUnique({
      where: {
        documentShareId_recipientUserId: {
          documentShareId: input.shareId,
          recipientUserId: input.userId,
        },
      },
      select: documentShareRecipientSelect,
    })

    if (existingRecipient?.status === DOCUMENT_SHARE_RECIPIENT_STATUS.REMOVED) {
      throw new NotFoundException('该分享已失效')
    }

    if (!existingRecipient) {
      const createdRecipient = await this.prisma.documentShareRecipient.create({
        data: {
          documentShareId: input.shareId,
          recipientUserId: input.userId,
          permission: DOCUMENT_SHARE_PERMISSION.VIEW,
          status: input.nextStatus,
          createdBy: input.userId,
          updatedBy: input.userId,
        },
        select: documentShareRecipientSelect,
      })

      return toDocumentShareRecipient(createdRecipient)
    }

    if (
      existingRecipient.status === input.nextStatus
      && existingRecipient.permission === DOCUMENT_SHARE_PERMISSION.VIEW
    ) {
      return toDocumentShareRecipient(existingRecipient)
    }

    const updatedRecipient = await this.prisma.documentShareRecipient.update({
      where: {
        id: existingRecipient.id,
      },
      data: {
        permission: DOCUMENT_SHARE_PERMISSION.VIEW,
        status: input.nextStatus,
        updatedBy: input.userId,
      },
      select: documentShareRecipientSelect,
    })

    return toDocumentShareRecipient(updatedRecipient)
  }

  private async findShareRecipientByUser(input: {
    shareId: string
    userId: string
  }): Promise<PersistedDocumentShareRecipient | null> {
    return await this.prisma.documentShareRecipient.findUnique({
      where: {
        documentShareId_recipientUserId: {
          documentShareId: input.shareId,
          recipientUserId: input.userId,
        },
      },
      select: documentShareRecipientSelect,
    })
  }
}
