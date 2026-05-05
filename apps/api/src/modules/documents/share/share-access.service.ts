import type {
  DocumentShareAccessSource,
  DocumentShareMode,
  DocumentSharePermission,
} from '@haohaoxue/samepage-contracts'
import type { AccessibleDocument } from '../core/access.service'
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
  WORKSPACE_MEMBER_ROLE,
  WORKSPACE_TYPE,
} from '@haohaoxue/samepage-contracts'
import { canManageDocumentShare } from '@haohaoxue/samepage-shared'
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { PrismaService } from '../../../database/prisma.service'
import { DocumentAccessService } from '../core/access.service'
import {
  documentShareRecipientRecordSelect,
  documentShareRecipientSelect,
  documentShareSelect,
  documentShareTreeNodeSelect,
  sharedDocumentPreviewSelect,
} from './shares.utils'

const SHARED_READ_ACTIONS = new Set<DocumentShareAccessAction>(['read', 'readAsset'])

export type DocumentShareAccessAction = 'read' | 'manageShare' | 'readAsset'

/** 分享访问解析输入。 */
export interface ResolveDocumentShareAccessInput {
  userId: string | null
  documentId: string
  action: DocumentShareAccessAction
  entryShareId?: string | null
  entryRecipientId?: string | null
}

/** 文档读取权限断言输入。 */
export interface AssertCanReadDocumentInput {
  userId: string
  documentId: string
  entryShareId?: string | null
  entryRecipientId?: string | null
}

/** 文档编辑权限断言输入。 */
export interface AssertCanEditDocumentInput {
  userId: string
  documentId: string
}

/** 文档分享管理权限断言输入。 */
export interface AssertCanManageDocumentShareInput {
  userId: string
  documentId: string
  mode: DocumentShareMode
}

/** 分享访问解析结果。 */
export interface ResolvedDocumentShareAccess {
  accessSource: DocumentShareAccessSource
  permission: DocumentSharePermission
  authorizationRootDocumentId: string
  authorizationShareId: string | null
  authorizationRecipientId: string | null
  entryShareId: string | null
  entryRecipientId: string | null
  canEditTree: boolean
  document: PersistedSharedDocumentPreview
  share: PersistedDocumentShare | null
  recipient: PersistedDocumentShareRecipient | null
  recipientRecord: PersistedDocumentShareRecipientRecord | null
}

@Injectable()
export class DocumentShareAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentAccessService: DocumentAccessService,
  ) {}

  async resolve(input: ResolveDocumentShareAccessInput): Promise<ResolvedDocumentShareAccess> {
    this.assertEntryCombination(input)

    if (input.entryShareId || input.entryRecipientId) {
      this.assertSharedEntryAction(input.action)
    }

    const document = await this.loadSharedDocumentPreview(input.documentId)

    if (input.entryShareId) {
      return await this.resolvePublicEntryAccess(input, document, input.entryShareId)
    }

    if (input.entryRecipientId) {
      return await this.resolveRecipientEntryAccess(input, document, input.entryRecipientId)
    }

    return await this.resolveWithoutEntry(input, document)
  }

  async assertCanReadDocument(input: AssertCanReadDocumentInput): Promise<ResolvedDocumentShareAccess> {
    return await this.resolve({
      ...input,
      action: 'read',
    })
  }

  async assertCanEditDocument(input: AssertCanEditDocumentInput): Promise<AccessibleDocument> {
    return await this.documentAccessService.assertCanEditDocument(input.userId, input.documentId)
  }

  async assertCanManageDocumentShare(input: AssertCanManageDocumentShareInput): Promise<AccessibleDocument> {
    const document = await this.assertCanEditDocument(input)

    if (!document.workspaceMemberRole) {
      throw new ForbiddenException('当前用户不能管理分享')
    }

    if (!canManageDocumentShare({
      workspaceType: document.workspaceType as typeof WORKSPACE_TYPE[keyof typeof WORKSPACE_TYPE],
      workspaceMemberRole: document.workspaceMemberRole as typeof WORKSPACE_MEMBER_ROLE[keyof typeof WORKSPACE_MEMBER_ROLE],
    })) {
      throw new ForbiddenException('仅 MAINTAINER 可以管理当前文档的分享设置')
    }

    return document
  }

  async resolvePublicEntry(input: {
    userId: string | null
    shareId: string
    documentId?: string
    action: DocumentShareAccessAction
  }): Promise<ResolvedDocumentShareAccess> {
    this.assertSharedEntryAction(input.action)
    const share = await this.assertActivePublicShareRecord(input.shareId)
    const document = await this.loadSharedDocumentPreview(input.documentId ?? share.documentId)

    return await this.resolvePublicShareAccess({
      userId: input.userId,
      documentId: input.documentId ?? share.documentId,
      action: input.action,
      entryShareId: share.id,
    }, document, share)
  }

  async resolveRecipientEntry(input: {
    userId: string
    recipientId: string
    documentId?: string
    action: DocumentShareAccessAction
  }): Promise<ResolvedDocumentShareAccess> {
    this.assertSharedEntryAction(input.action)
    const recipient = await this.assertAccessibleRecipientRecord(input.userId, input.recipientId)
    const document = await this.loadSharedDocumentPreview(input.documentId ?? recipient.documentShare.documentId)

    return await this.resolveRecipientRecordAccess({
      userId: input.userId,
      documentId: input.documentId ?? recipient.documentShare.documentId,
      action: input.action,
      entryRecipientId: recipient.id,
    }, document, recipient)
  }

  private async resolvePublicEntryAccess(
    input: ResolveDocumentShareAccessInput,
    document: PersistedSharedDocumentPreview,
    entryShareId: string,
  ): Promise<ResolvedDocumentShareAccess> {
    const share = await this.assertActivePublicShareRecord(entryShareId)

    return await this.resolvePublicShareAccess(input, document, share)
  }

  private async resolvePublicShareAccess(
    input: ResolveDocumentShareAccessInput,
    document: PersistedSharedDocumentPreview,
    share: PersistedDocumentShare,
  ): Promise<ResolvedDocumentShareAccess> {
    await this.assertEntryShareStillAuthorizesDocument({
      entryShareId: share.id,
      documentId: document.id,
      workspaceId: document.workspaceId,
    })

    if (input.userId && await this.documentAccessService.hasWorkspaceAccess(input.userId, document.workspaceId)) {
      return this.toWorkspaceAccess({
        document,
        share,
        entryShareId: share.id,
      })
    }

    await this.assertNoExplicitShareDeny(input, document)

    if (share.mode === DOCUMENT_SHARE_MODE.PUBLIC) {
      return this.toSharedAccess({
        accessSource: DOCUMENT_SHARE_ACCESS_SOURCE.PUBLIC_SHARE,
        document,
        share,
        recipient: null,
        recipientRecord: null,
        entryShareId: share.id,
        entryRecipientId: null,
      })
    }

    if (!input.userId) {
      throw new UnauthorizedException('请先登录后查看该分享')
    }

    const recipient = await this.prisma.documentShareRecipient.findUnique({
      where: {
        documentShareId_recipientUserId: {
          documentShareId: share.id,
          recipientUserId: input.userId,
        },
      },
      select: documentShareRecipientSelect,
    })

    return this.toSharedAccess({
      accessSource: DOCUMENT_SHARE_ACCESS_SOURCE.PUBLIC_SHARE,
      document,
      share,
      recipient: recipient?.status === DOCUMENT_SHARE_RECIPIENT_STATUS.REMOVED ? null : recipient,
      recipientRecord: null,
      entryShareId: share.id,
      entryRecipientId: null,
    })
  }

  private async resolveRecipientEntryAccess(
    input: ResolveDocumentShareAccessInput,
    document: PersistedSharedDocumentPreview,
    entryRecipientId: string,
  ): Promise<ResolvedDocumentShareAccess> {
    if (!input.userId) {
      throw new UnauthorizedException('请先登录后查看该分享')
    }

    const recipientRecord = await this.assertAccessibleRecipientRecord(input.userId, entryRecipientId)

    return await this.resolveRecipientRecordAccess(input, document, recipientRecord)
  }

  private async resolveRecipientRecordAccess(
    input: ResolveDocumentShareAccessInput,
    document: PersistedSharedDocumentPreview,
    recipientRecord: PersistedDocumentShareRecipientRecord,
  ): Promise<ResolvedDocumentShareAccess> {
    const share = recipientRecord.documentShare

    if (share.mode !== DOCUMENT_SHARE_MODE.DIRECT_USER) {
      throw new NotFoundException('该分享已失效')
    }

    await this.assertEntryShareStillAuthorizesDocument({
      entryShareId: share.id,
      documentId: document.id,
      workspaceId: document.workspaceId,
    })

    if (recipientRecord.status !== DOCUMENT_SHARE_RECIPIENT_STATUS.ACTIVE) {
      throw new ForbiddenException('尚未接收该分享')
    }

    await this.assertNoExplicitShareDeny(input, document)

    return this.toSharedAccess({
      accessSource: DOCUMENT_SHARE_ACCESS_SOURCE.DIRECT_SHARE,
      document,
      share,
      recipient: recipientRecord,
      recipientRecord,
      entryShareId: null,
      entryRecipientId: recipientRecord.id,
    })
  }

  private async resolveWithoutEntry(
    input: ResolveDocumentShareAccessInput,
    document: PersistedSharedDocumentPreview,
  ): Promise<ResolvedDocumentShareAccess> {
    if (input.userId && await this.documentAccessService.hasWorkspaceAccess(input.userId, document.workspaceId)) {
      return this.toWorkspaceAccess({
        document,
        share: null,
        entryShareId: null,
      })
    }

    const share = await this.findNearestActiveShareForDocument({
      documentId: document.id,
      workspaceId: document.workspaceId,
    })

    if (!share || share.mode === DOCUMENT_SHARE_MODE.NONE) {
      throw new NotFoundException('该分享已失效')
    }

    await this.assertNoExplicitShareDeny(input, document)

    if (share.mode === DOCUMENT_SHARE_MODE.PUBLIC) {
      return this.toSharedAccess({
        accessSource: DOCUMENT_SHARE_ACCESS_SOURCE.PUBLIC_SHARE,
        document,
        share,
        recipient: null,
        recipientRecord: null,
        entryShareId: null,
        entryRecipientId: null,
      })
    }

    if (!input.userId) {
      throw new UnauthorizedException('请先登录后查看该分享')
    }

    if (share.mode === DOCUMENT_SHARE_MODE.LOGGED_IN) {
      const recipient = await this.prisma.documentShareRecipient.findUnique({
        where: {
          documentShareId_recipientUserId: {
            documentShareId: share.id,
            recipientUserId: input.userId,
          },
        },
        select: documentShareRecipientSelect,
      })

      if (!recipient || recipient.status !== DOCUMENT_SHARE_RECIPIENT_STATUS.ACTIVE) {
        throw new ForbiddenException('尚未接收该分享')
      }

      return this.toSharedAccess({
        accessSource: DOCUMENT_SHARE_ACCESS_SOURCE.PUBLIC_SHARE,
        document,
        share,
        recipient,
        recipientRecord: null,
        entryShareId: null,
        entryRecipientId: null,
      })
    }

    const recipientRecord = await this.prisma.documentShareRecipient.findFirst({
      where: {
        documentShareId: share.id,
        recipientUserId: input.userId,
        status: DOCUMENT_SHARE_RECIPIENT_STATUS.ACTIVE,
      },
      select: documentShareRecipientRecordSelect,
    })

    if (!recipientRecord) {
      throw new ForbiddenException('尚未接收该分享')
    }

    return this.toSharedAccess({
      accessSource: DOCUMENT_SHARE_ACCESS_SOURCE.DIRECT_SHARE,
      document,
      share,
      recipient: recipientRecord,
      recipientRecord,
      entryShareId: null,
      entryRecipientId: null,
    })
  }

  private assertEntryCombination(input: ResolveDocumentShareAccessInput) {
    if (input.entryShareId && input.entryRecipientId) {
      throw new ForbiddenException('分享入口无效')
    }
  }

  private assertSharedEntryAction(action: DocumentShareAccessAction) {
    if (!SHARED_READ_ACTIONS.has(action)) {
      throw new ForbiddenException('分享接收方不能管理分享')
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

  private async assertNoExplicitShareDeny(
    _input: ResolveDocumentShareAccessInput,
    _document: PersistedSharedDocumentPreview,
  ) {
    await Promise.resolve()
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

  private toWorkspaceAccess(input: {
    document: PersistedSharedDocumentPreview
    share: PersistedDocumentShare | null
    entryShareId: string | null
  }): ResolvedDocumentShareAccess {
    return {
      accessSource: DOCUMENT_SHARE_ACCESS_SOURCE.WORKSPACE_MEMBER,
      permission: (input.share?.permission as DocumentSharePermission | undefined) ?? DOCUMENT_SHARE_PERMISSION.VIEW,
      authorizationRootDocumentId: input.share?.documentId ?? input.document.id,
      authorizationShareId: input.share?.id ?? null,
      authorizationRecipientId: null,
      entryShareId: input.entryShareId,
      entryRecipientId: null,
      canEditTree: true,
      document: input.document,
      share: input.share,
      recipient: null,
      recipientRecord: null,
    }
  }

  private toSharedAccess(input: {
    accessSource: DocumentShareAccessSource
    document: PersistedSharedDocumentPreview
    share: PersistedDocumentShare
    recipient: PersistedDocumentShareRecipient | null
    recipientRecord: PersistedDocumentShareRecipientRecord | null
    entryShareId: string | null
    entryRecipientId: string | null
  }): ResolvedDocumentShareAccess {
    return {
      accessSource: input.accessSource,
      permission: (input.recipient?.permission as DocumentSharePermission | undefined) ?? (input.share.permission as DocumentSharePermission),
      authorizationRootDocumentId: input.share.documentId,
      authorizationShareId: input.share.id,
      authorizationRecipientId: input.recipient?.id ?? null,
      entryShareId: input.entryShareId,
      entryRecipientId: input.entryRecipientId,
      canEditTree: false,
      document: input.document,
      share: input.share,
      recipient: input.recipient,
      recipientRecord: input.recipientRecord,
    }
  }
}
