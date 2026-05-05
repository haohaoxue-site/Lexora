import type {
  CollabPermissionInvalidationRequest,
  CreateDirectDocumentShareRequest,
  DocumentPublicShareInfo,
  DocumentShareMode,
  DocumentShareProjection,
  DocumentShareRecipientSummary,
  SetDocumentLinkShareRequest,
  UserCollabIdentity,
} from '@haohaoxue/samepage-contracts'
import type { PersistedDocumentShareProjectionPathNode, PersistedDocumentShareRecipientRecord } from './shares.utils'
import {
  DOCUMENT_SHARE_MODE,
  DOCUMENT_SHARE_PERMISSION,
  DOCUMENT_SHARE_RECIPIENT_STATUS,
  DOCUMENT_SHARE_STATUS,
  WORKSPACE_TYPE,
} from '@haohaoxue/samepage-contracts'
import {
  isDocumentLinkShareMode,
  isExactUserCodeQuery,
  normalizeUserCodeQuery,
  buildDocumentShareProjectionMap as projectDocumentShareProjectionMap,
} from '@haohaoxue/samepage-shared'
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../database/prisma.service'
import { CollabPermissionInvalidationPublisherService } from '../../../infrastructure/publisher/collab-permission-invalidation-publisher.service'
import { DocumentAccessService } from '../core/access.service'
import { DocumentShareAccessService } from './share-access.service'
import {
  collabUserIdentitySelect,
  documentShareProjectionPathNodeSelect,
  documentShareProjectionSelect,
  documentShareRecipientRecordSelect,
  documentShareRecipientSelect,
  documentShareSelect,
  documentShareTreeNodeSelect,
  isRetryableSerializableTransactionError,
  toDocumentPublicShare,
  toDocumentShareRecipientSummary,
  toRequiredUserCollabIdentity,
} from './shares.utils'

interface ConfirmInheritanceUnlinkOptions {
  confirmUnlinkInheritance?: boolean
}

type DocumentShareTransactionClient = Pick<
  Prisma.TransactionClient,
  'document' | 'documentShare' | 'documentShareRecipient'
>

interface ShareInvalidationTargets {
  shareIds: string[]
  recipientIds: string[]
}

@Injectable()
export class DocumentSharesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentAccessService: DocumentAccessService,
    private readonly documentShareAccessService: DocumentShareAccessService,
    private readonly collabPermissionInvalidationPublisher: CollabPermissionInvalidationPublisherService,
  ) {}

  async buildDocumentShareProjectionMap(
    documents: Array<{
      id: string
      parentId: string | null
      title: string
    }>,
  ): Promise<Map<string, DocumentShareProjection>> {
    if (documents.length === 0) {
      return new Map()
    }

    const shares = await this.prisma.documentShare.findMany({
      where: {
        documentId: {
          in: documents.map(document => document.id),
        },
        status: DOCUMENT_SHARE_STATUS.ACTIVE,
      },
      select: documentShareProjectionSelect,
    })

    return projectDocumentShareProjectionMap({
      documents,
      shares: shares.map(share => ({
        id: share.id,
        documentId: share.documentId,
        mode: share.mode as DocumentShareMode,
        directUserCount: share.mode === DOCUMENT_SHARE_MODE.DIRECT_USER ? share.recipients.length : 0,
        updatedAt: share.updatedAt,
        updatedBy: share.updatedBy,
      })),
    })
  }

  async resolveDocumentShareProjectionForDocument(document: {
    id: string
    workspaceId: string
    parentId: string | null
    title: string
  }): Promise<DocumentShareProjection | null> {
    const pathNodes = await this.loadDocumentShareProjectionPath(document)

    if (pathNodes.length === 0) {
      return null
    }

    const projectionByDocumentId = await this.buildDocumentShareProjectionMap(pathNodes)
    return projectionByDocumentId.get(document.id) ?? null
  }

  async getPublicShare(userId: string, documentId: string): Promise<DocumentPublicShareInfo> {
    await this.documentShareAccessService.assertCanManageDocumentShare({
      userId,
      documentId,
      mode: DOCUMENT_SHARE_MODE.LOGGED_IN,
    })
    const share = await this.findActiveLocalShare(documentId)

    return {
      share: share && isDocumentLinkShareMode(share.mode as DocumentShareMode)
        ? toDocumentPublicShare(share)
        : null,
    }
  }

  async enablePublicShare(
    userId: string,
    documentId: string,
    options: SetDocumentLinkShareRequest | ConfirmInheritanceUnlinkOptions = { mode: DOCUMENT_SHARE_MODE.LOGGED_IN },
  ): Promise<DocumentPublicShareInfo> {
    const shareMode = 'mode' in options && options.mode
      ? options.mode
      : DOCUMENT_SHARE_MODE.LOGGED_IN
    const document = await this.documentShareAccessService.assertCanManageDocumentShare({
      userId,
      documentId,
      mode: shareMode,
    })
    await this.assertInheritanceUnlinkConfirmed(document, options.confirmUnlinkInheritance)

    const result = await this.runSerializableShareTransaction(async (tx) => {
      let invalidationTargets = createShareInvalidationTargets()
      const currentShare = await this.findActiveLocalShare(documentId, tx)

      if (currentShare?.mode === shareMode) {
        return {
          share: toDocumentPublicShare(currentShare),
          invalidationTargets,
        }
      }

      if (currentShare) {
        invalidationTargets = mergeShareInvalidationTargets(
          invalidationTargets,
          await this.removeSharesWithRecipientsInTx(tx, [currentShare.id], userId),
        )
      }

      const share = await tx.documentShare.create({
        data: {
          documentId,
          mode: shareMode,
          permission: DOCUMENT_SHARE_PERMISSION.VIEW,
          status: DOCUMENT_SHARE_STATUS.ACTIVE,
          createdBy: userId,
          updatedBy: userId,
        },
        select: documentShareSelect,
      })

      return {
        share: toDocumentPublicShare(share),
        invalidationTargets,
      }
    })

    await this.notifyShareInvalidations(result.invalidationTargets)
    return {
      share: result.share,
    }
  }

  async revokePublicShare(userId: string, documentId: string): Promise<null> {
    await this.documentShareAccessService.assertCanManageDocumentShare({
      userId,
      documentId,
      mode: DOCUMENT_SHARE_MODE.LOGGED_IN,
    })
    const activeShare = await this.findActiveLocalShare(documentId)

    if (!activeShare || !isDocumentLinkShareMode(activeShare.mode as DocumentShareMode)) {
      return null
    }

    await this.removeSharesWithRecipients([activeShare.id], userId)
    return null
  }

  async getDirectShares(userId: string, documentId: string): Promise<DocumentShareRecipientSummary[]> {
    await this.documentShareAccessService.assertCanManageDocumentShare({
      userId,
      documentId,
      mode: DOCUMENT_SHARE_MODE.DIRECT_USER,
    })

    const recipients = await this.prisma.documentShareRecipient.findMany({
      where: {
        status: {
          not: DOCUMENT_SHARE_RECIPIENT_STATUS.REMOVED,
        },
        documentShare: {
          documentId,
          mode: DOCUMENT_SHARE_MODE.DIRECT_USER,
          status: DOCUMENT_SHARE_STATUS.ACTIVE,
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: documentShareRecipientRecordSelect,
    })

    return recipients.map(record => toDocumentShareRecipientSummary(record))
  }

  async createDirectShare(
    userId: string,
    documentId: string,
    payload: CreateDirectDocumentShareRequest,
  ): Promise<DocumentShareRecipientSummary> {
    const document = await this.documentShareAccessService.assertCanManageDocumentShare({
      userId,
      documentId,
      mode: DOCUMENT_SHARE_MODE.DIRECT_USER,
    })
    const targetUser = await this.findUserByCode(payload.userCode)

    if (targetUser.id === userId) {
      throw new BadRequestException('不能分享给自己')
    }

    if (
      document.workspaceType === WORKSPACE_TYPE.TEAM
      && await this.documentAccessService.hasWorkspaceAccess(targetUser.id, document.workspaceId)
    ) {
      throw new BadRequestException('该用户已经是团队成员，无需定向分享')
    }

    await this.assertInheritanceUnlinkConfirmed(document, payload.confirmUnlinkInheritance)

    const result = await this.runSerializableShareTransaction(async (tx) => {
      let invalidationTargets = createShareInvalidationTargets()
      const currentShare = await this.findActiveLocalShare(documentId, tx)
      const shareResult = currentShare?.mode === DOCUMENT_SHARE_MODE.DIRECT_USER
        ? {
            share: currentShare,
            invalidationTargets,
          }
        : await this.replaceCurrentShareWithDirectShare({
            tx,
            documentId,
            currentShareId: currentShare?.id ?? null,
            userId,
          })
      const share = shareResult.share
      invalidationTargets = mergeShareInvalidationTargets(
        invalidationTargets,
        shareResult.invalidationTargets,
      )

      const existingRecipient = await tx.documentShareRecipient.findUnique({
        where: {
          documentShareId_recipientUserId: {
            documentShareId: share.id,
            recipientUserId: targetUser.id,
          },
        },
        select: documentShareRecipientSelect,
      })

      const nextRecipientStatus = existingRecipient?.status === DOCUMENT_SHARE_RECIPIENT_STATUS.ACTIVE
        ? DOCUMENT_SHARE_RECIPIENT_STATUS.ACTIVE
        : DOCUMENT_SHARE_RECIPIENT_STATUS.PENDING

      if (!existingRecipient) {
        const createdRecipient = await tx.documentShareRecipient.create({
          data: {
            documentShareId: share.id,
            recipientUserId: targetUser.id,
            permission: DOCUMENT_SHARE_PERMISSION.VIEW,
            status: nextRecipientStatus,
            createdBy: userId,
            updatedBy: userId,
          },
          select: documentShareRecipientSelect,
        })

        return {
          recipientId: createdRecipient.id,
          invalidationTargets,
        }
      }

      if (
        existingRecipient.status === nextRecipientStatus
        && existingRecipient.permission === DOCUMENT_SHARE_PERMISSION.VIEW
      ) {
        return {
          recipientId: existingRecipient.id,
          invalidationTargets,
        }
      }

      const updatedRecipient = await tx.documentShareRecipient.update({
        where: {
          id: existingRecipient.id,
        },
        data: {
          permission: DOCUMENT_SHARE_PERMISSION.VIEW,
          status: nextRecipientStatus,
          updatedBy: userId,
        },
        select: documentShareRecipientSelect,
      })

      return {
        recipientId: updatedRecipient.id,
        invalidationTargets,
      }
    })

    await this.notifyShareInvalidations(result.invalidationTargets)

    const recipient = await this.loadRecipientRecordById(result.recipientId)
    return toDocumentShareRecipientSummary(recipient)
  }

  async revokeDirectShare(userId: string, documentId: string, recipientId: string): Promise<null> {
    await this.documentShareAccessService.assertCanManageDocumentShare({
      userId,
      documentId,
      mode: DOCUMENT_SHARE_MODE.DIRECT_USER,
    })
    const recipient = await this.prisma.documentShareRecipient.findUnique({
      where: {
        id: recipientId,
      },
      select: documentShareRecipientRecordSelect,
    })

    if (
      !recipient
      || recipient.documentShare.documentId !== documentId
      || recipient.documentShare.mode !== DOCUMENT_SHARE_MODE.DIRECT_USER
      || recipient.documentShare.status === DOCUMENT_SHARE_STATUS.REMOVED
    ) {
      return null
    }

    const invalidationTargets = await this.runSerializableShareTransaction(async (tx) => {
      let targets = createShareInvalidationTargets()
      await tx.documentShareRecipient.update({
        where: {
          id: recipient.id,
        },
        data: {
          status: DOCUMENT_SHARE_RECIPIENT_STATUS.REMOVED,
          updatedBy: userId,
        },
        select: documentShareRecipientSelect,
      })
      targets = mergeShareInvalidationTargets(targets, {
        shareIds: [],
        recipientIds: [recipient.id],
      })

      const remainingRecipient = await tx.documentShareRecipient.findFirst({
        where: {
          documentShareId: recipient.documentShareId,
          status: {
            not: DOCUMENT_SHARE_RECIPIENT_STATUS.REMOVED,
          },
        },
        select: {
          id: true,
        },
      })

      if (!remainingRecipient) {
        targets = mergeShareInvalidationTargets(
          targets,
          await this.removeSharesWithRecipientsInTx(tx, [recipient.documentShareId], userId),
        )
      }

      return targets
    })

    await this.notifyShareInvalidations(invalidationTargets)

    return null
  }

  async setNoSharePolicy(
    userId: string,
    documentId: string,
    options: ConfirmInheritanceUnlinkOptions = {},
  ): Promise<null> {
    const document = await this.documentShareAccessService.assertCanManageDocumentShare({
      userId,
      documentId,
      mode: DOCUMENT_SHARE_MODE.NONE,
    })
    await this.assertInheritanceUnlinkConfirmed(document, options.confirmUnlinkInheritance)

    const invalidationTargets = await this.runSerializableShareTransaction(async (tx) => {
      let targets = createShareInvalidationTargets()
      const currentShare = await this.findActiveLocalShare(documentId, tx)

      if (!document.parentId) {
        if (currentShare) {
          targets = mergeShareInvalidationTargets(
            targets,
            await this.removeSharesWithRecipientsInTx(tx, [currentShare.id], userId),
          )
        }

        return targets
      }

      if (currentShare?.mode === DOCUMENT_SHARE_MODE.NONE) {
        return targets
      }

      if (currentShare) {
        targets = mergeShareInvalidationTargets(
          targets,
          await this.removeSharesWithRecipientsInTx(tx, [currentShare.id], userId),
        )
      }

      await tx.documentShare.create({
        data: {
          documentId,
          mode: DOCUMENT_SHARE_MODE.NONE,
          permission: DOCUMENT_SHARE_PERMISSION.VIEW,
          status: DOCUMENT_SHARE_STATUS.ACTIVE,
          createdBy: userId,
          updatedBy: userId,
        },
        select: {
          id: true,
        },
      })

      return targets
    })

    await this.notifyShareInvalidations(invalidationTargets)

    return null
  }

  async restoreInheritedPolicy(userId: string, documentId: string): Promise<null> {
    await this.documentShareAccessService.assertCanManageDocumentShare({
      userId,
      documentId,
      mode: DOCUMENT_SHARE_MODE.DIRECT_USER,
    })
    const currentShare = await this.findActiveLocalShare(documentId)

    if (!currentShare) {
      return null
    }

    if (currentShare.mode !== DOCUMENT_SHARE_MODE.DIRECT_USER) {
      await this.documentShareAccessService.assertCanManageDocumentShare({
        userId,
        documentId,
        mode: currentShare.mode as DocumentShareMode,
      })
    }

    await this.removeSharesWithRecipients([currentShare.id], userId)
    return null
  }

  async reconcileSharesAfterDocumentMove(): Promise<void> {}

  private async replaceCurrentShareWithDirectShare(input: {
    tx: DocumentShareTransactionClient
    documentId: string
    currentShareId: string | null
    userId: string
  }) {
    let invalidationTargets = createShareInvalidationTargets()

    if (input.currentShareId) {
      invalidationTargets = mergeShareInvalidationTargets(
        invalidationTargets,
        await this.removeSharesWithRecipientsInTx(input.tx, [input.currentShareId], input.userId),
      )
    }

    const share = await input.tx.documentShare.create({
      data: {
        documentId: input.documentId,
        mode: DOCUMENT_SHARE_MODE.DIRECT_USER,
        permission: DOCUMENT_SHARE_PERMISSION.VIEW,
        status: DOCUMENT_SHARE_STATUS.ACTIVE,
        createdBy: input.userId,
        updatedBy: input.userId,
      },
      select: documentShareSelect,
    })

    return {
      share,
      invalidationTargets,
    }
  }

  private async loadDocumentShareProjectionPath(document: {
    id: string
    workspaceId: string
    parentId: string | null
    title: string
  }): Promise<PersistedDocumentShareProjectionPathNode[]> {
    const pathNodes: PersistedDocumentShareProjectionPathNode[] = [{
      id: document.id,
      workspaceId: document.workspaceId,
      parentId: document.parentId,
      title: document.title,
      trashedAt: null,
    }]
    let currentParentId = document.parentId

    while (currentParentId) {
      const parentDocument = await this.prisma.document.findUnique({
        where: {
          id: currentParentId,
        },
        select: documentShareProjectionPathNodeSelect,
      })

      if (
        !parentDocument
        || parentDocument.workspaceId !== document.workspaceId
        || parentDocument.trashedAt !== null
      ) {
        throw new NotFoundException(`Document "${currentParentId}" not found`)
      }

      pathNodes.push(parentDocument)
      currentParentId = parentDocument.parentId
    }

    return pathNodes
  }

  private async assertInheritanceUnlinkConfirmed(
    document: {
      id: string
      workspaceId: string
      parentId: string | null
    },
    confirmed: boolean | undefined,
  ) {
    if (confirmed || !document.parentId) {
      return
    }

    const currentShare = await this.findActiveLocalShare(document.id)

    if (currentShare) {
      return
    }

    const inheritedShare = await this.findNearestAncestorActiveShare({
      workspaceId: document.workspaceId,
      parentId: document.parentId,
    })

    if (inheritedShare) {
      throw new BadRequestException('操作将解除该页面与其上级页面之间的关联，从而不再延用分享设置')
    }
  }

  private async findNearestAncestorActiveShare(input: {
    workspaceId: string
    parentId: string | null
  }) {
    let currentParentId = input.parentId

    while (currentParentId) {
      const parentDocument = await this.prisma.document.findUnique({
        where: {
          id: currentParentId,
        },
        select: documentShareTreeNodeSelect,
      })

      if (
        !parentDocument
        || parentDocument.workspaceId !== input.workspaceId
        || parentDocument.trashedAt !== null
      ) {
        throw new NotFoundException(`Document "${currentParentId}" not found`)
      }

      const share = await this.findActiveLocalShare(parentDocument.id)

      if (share) {
        return share
      }

      currentParentId = parentDocument.parentId
    }

    return null
  }

  private async runSerializableShareTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        })
      }
      catch (error) {
        if (!isRetryableSerializableTransactionError(error) || attempt === 2) {
          throw error
        }
      }
    }

    throw new Error('unreachable')
  }

  private async findActiveLocalShare(
    documentId: string,
    client: Pick<Prisma.TransactionClient, 'documentShare'> = this.prisma,
  ) {
    return await client.documentShare.findFirst({
      where: {
        documentId,
        status: DOCUMENT_SHARE_STATUS.ACTIVE,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: documentShareSelect,
    })
  }

  private async findActiveLocalShareByMode(
    documentId: string,
    mode: DocumentShareMode,
  ) {
    return await this.prisma.documentShare.findFirst({
      where: {
        documentId,
        mode,
        status: DOCUMENT_SHARE_STATUS.ACTIVE,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: documentShareSelect,
    })
  }

  private async removeSharesWithRecipients(shareIds: string[], userId: string) {
    if (shareIds.length === 0) {
      return
    }

    const invalidationTargets = await this.prisma.$transaction(async (tx) => {
      return await this.removeSharesWithRecipientsInTx(tx, shareIds, userId)
    })

    await this.notifyShareInvalidations(invalidationTargets)
  }

  private async removeSharesWithRecipientsInTx(
    tx: Pick<Prisma.TransactionClient, 'documentShare' | 'documentShareRecipient'>,
    shareIds: string[],
    userId: string,
  ): Promise<ShareInvalidationTargets> {
    if (shareIds.length === 0) {
      return createShareInvalidationTargets()
    }

    const uniqueShareIds = Array.from(new Set(shareIds))
    const shareWhere = uniqueShareIds.length === 1
      ? { id: uniqueShareIds[0] }
      : { id: { in: shareIds } }
    const recipientWhere = uniqueShareIds.length === 1
      ? { documentShareId: uniqueShareIds[0] }
      : { documentShareId: { in: shareIds } }
    const recipients = await tx.documentShareRecipient.findMany({
      where: {
        ...recipientWhere,
        status: {
          not: DOCUMENT_SHARE_RECIPIENT_STATUS.REMOVED,
        },
      },
      select: {
        id: true,
      },
    }) ?? []

    await tx.documentShare.updateMany({
      where: shareWhere,
      data: {
        status: DOCUMENT_SHARE_STATUS.REMOVED,
        updatedBy: userId,
      },
    })

    await tx.documentShareRecipient.updateMany({
      where: {
        ...recipientWhere,
        status: {
          not: DOCUMENT_SHARE_RECIPIENT_STATUS.REMOVED,
        },
      },
      data: {
        status: DOCUMENT_SHARE_RECIPIENT_STATUS.REMOVED,
        updatedBy: userId,
      },
    })

    return {
      shareIds: uniqueShareIds,
      recipientIds: recipients.map(recipient => recipient.id),
    }
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

  private async findUserByCode(userCode: string): Promise<UserCollabIdentity> {
    const normalizedUserCode = normalizeUserCodeQuery(userCode)

    if (!isExactUserCodeQuery(normalizedUserCode)) {
      throw new NotFoundException('未找到用户')
    }

    const user = await this.prisma.user.findUnique({
      where: {
        userCode: normalizedUserCode,
      },
      select: collabUserIdentitySelect,
    })

    if (!user) {
      throw new NotFoundException('未找到用户')
    }

    return toRequiredUserCollabIdentity(user)
  }

  private async notifyShareInvalidations(input: ShareInvalidationTargets): Promise<void> {
    const invalidations: CollabPermissionInvalidationRequest[] = [
      ...input.shareIds.map(entryShareId => ({
        reason: 'share-revoked' as const,
        entryShareId,
      })),
      ...input.recipientIds.map(entryRecipientId => ({
        reason: 'share-revoked' as const,
        entryRecipientId,
      })),
    ]

    await this.collabPermissionInvalidationPublisher.publishPermissionInvalidations(invalidations)
  }
}

function createShareInvalidationTargets(): ShareInvalidationTargets {
  return {
    shareIds: [],
    recipientIds: [],
  }
}

function mergeShareInvalidationTargets(...targets: ShareInvalidationTargets[]): ShareInvalidationTargets {
  const shareIds = new Set<string>()
  const recipientIds = new Set<string>()

  for (const target of targets) {
    for (const shareId of target.shareIds) {
      shareIds.add(shareId)
    }

    for (const recipientId of target.recipientIds) {
      recipientIds.add(recipientId)
    }
  }

  return {
    shareIds: Array.from(shareIds),
    recipientIds: Array.from(recipientIds),
  }
}
