import type { DocumentTrashItem } from '@haohaoxue/samepage-contracts'
import type { PersistedDocument, WorkspaceDocumentContext } from '../core/documents.utils'
import {
  DOCUMENT_VISIBILITY,
  WORKSPACE_TYPE,
} from '@haohaoxue/samepage-contracts'
import { resolveOwnedDocumentCollectionId } from '@haohaoxue/samepage-shared'
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { DocumentStatus } from '@prisma/client'
import { PrismaService } from '../../../database/prisma.service'
import { CollabPermissionInvalidationPublisherService } from '../../../infrastructure/publisher/collab-permission-invalidation-publisher.service'
import { DocumentAccessService } from '../core/access.service'
import {
  buildWorkspaceDocumentContext,
  canUserAccessWorkspaceDocument,
  collectAncestorTitles,
  collectDescendantDocumentIds,
  documentSelect,

} from '../core/documents.utils'

@Injectable()
export class DocumentTrashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentAccessService: DocumentAccessService,
    private readonly collabPermissionInvalidationPublisher: CollabPermissionInvalidationPublisherService,
  ) {}

  async getTrashDocuments(userId: string, workspaceId: string): Promise<DocumentTrashItem[]> {
    const workspace = await this.documentAccessService.assertAccessibleWorkspace(userId, workspaceId)
    const context = await this.loadWorkspaceTrashContext({
      workspaceId: workspace.id,
      userId,
      workspaceType: workspace.type,
    })

    return context.documents
      .filter((document) => {
        if (!document.trashedAt) {
          return false
        }

        if (!document.parentId) {
          return true
        }

        return !context.documentsById.get(document.parentId)?.trashedAt
      })
      .sort((left, right) => {
        const leftTrashedAt = left.trashedAt?.getTime() ?? 0
        const rightTrashedAt = right.trashedAt?.getTime() ?? 0

        return rightTrashedAt - leftTrashedAt
      })
      .map(document => toDocumentTrashItem(document, context, workspace.type))
  }

  async deleteDocument(userId: string, id: string): Promise<void> {
    const document = await this.documentAccessService.assertCanEditDocument(userId, id)
    const context = await this.loadWorkspaceDocumentContext({
      workspaceId: document.workspaceId,
      userId,
      workspaceType: document.workspaceType,
    })
    const removableDocumentIds = new Set<string>()

    collectDescendantDocumentIds(id, context, removableDocumentIds)
    const targetDocumentIds = Array.from(removableDocumentIds)

    await this.prisma.$bypass.$transaction(async (tx) => {
      await tx.document.updateMany({
        where: {
          id: {
            in: targetDocumentIds,
          },
        },
        data: {
          trashedAt: new Date(),
          trashedBy: userId,
        },
      })
    })

    await this.collabPermissionInvalidationPublisher.publishPermissionInvalidations(
      targetDocumentIds.map(documentId => ({
        reason: 'document-trashed' as const,
        documentId,
      })),
    )
  }

  async restoreDocumentFromTrash(userId: string, id: string): Promise<void> {
    const document = await this.documentAccessService.assertCanManageTrashedDocument(userId, id)
    const context = await this.loadWorkspaceTrashContext({
      workspaceId: document.workspaceId,
    })

    assertTrashRootDocument(context, id)

    const targetDocumentIds = collectTrashedSubtreeDocumentIds(context, id)

    await this.prisma.document.updateMany({
      where: {
        id: {
          in: targetDocumentIds,
        },
      },
      data: {
        trashedAt: null,
        trashedBy: null,
      },
    })
  }

  async permanentlyDeleteDocument(userId: string, id: string): Promise<void> {
    const targetDocumentIds = await this.resolvePermanentlyRemovableDocumentIds(userId, id)

    await this.prisma.$bypass.$transaction(async (tx) => {
      await tx.document.deleteMany({
        where: {
          id: {
            in: targetDocumentIds,
          },
        },
      })
    })

    await this.collabPermissionInvalidationPublisher.publishPermissionInvalidations(
      targetDocumentIds.map(documentId => ({
        reason: 'document-trashed' as const,
        documentId,
      })),
    )
  }

  private async loadWorkspaceDocumentContext(input: {
    workspaceId: string
    userId: string
    workspaceType: string
  }): Promise<WorkspaceDocumentContext> {
    const documents = await this.prisma.document.findMany({
      where: {
        workspaceId: input.workspaceId,
        status: {
          in: [DocumentStatus.ACTIVE, DocumentStatus.LOCKED],
        },
        trashedAt: null,
        ...(input.workspaceType === WORKSPACE_TYPE.TEAM
          ? {
              OR: [
                {
                  visibility: DOCUMENT_VISIBILITY.WORKSPACE,
                },
                {
                  createdBy: input.userId,
                },
              ],
            }
          : {}),
      },
      select: documentSelect,
      orderBy: [
        { order: 'asc' },
        { updatedAt: 'desc' },
      ],
    })

    return buildWorkspaceDocumentContext(documents.filter(document =>
      canUserAccessWorkspaceDocument({
        userId: input.userId,
        workspaceType: input.workspaceType,
        visibility: document.visibility,
        createdBy: document.createdBy,
      }),
    ))
  }

  private async loadWorkspaceTrashContext(input: {
    workspaceId: string
    userId?: string
    workspaceType?: string
  }): Promise<WorkspaceDocumentContext> {
    const documents = await this.prisma.document.findMany({
      where: {
        workspaceId: input.workspaceId,
        status: {
          in: [DocumentStatus.ACTIVE, DocumentStatus.LOCKED],
        },
      },
      select: documentSelect,
      orderBy: [
        { order: 'asc' },
        { updatedAt: 'desc' },
      ],
    })

    return buildWorkspaceDocumentContext(documents.filter((document) => {
      if (!input.userId || !input.workspaceType) {
        return true
      }

      return canUserAccessWorkspaceDocument({
        userId: input.userId,
        workspaceType: input.workspaceType,
        visibility: document.visibility,
        createdBy: document.createdBy,
      })
    }))
  }

  private async resolvePermanentlyRemovableDocumentIds(userId: string, documentId: string): Promise<string[]> {
    try {
      const trashedDocument = await this.documentAccessService.assertCanManageTrashedDocument(userId, documentId)
      const trashContext = await this.loadWorkspaceTrashContext({
        workspaceId: trashedDocument.workspaceId,
      })

      assertTrashRootDocument(trashContext, documentId)

      return collectTrashedSubtreeDocumentIds(trashContext, documentId)
    }
    catch (error) {
      if (!(error instanceof NotFoundException)) {
        throw error
      }
    }

    const activeDocument = await this.documentAccessService.assertCanEditDocument(userId, documentId)
    const workspaceContext = await this.loadWorkspaceTrashContext({
      workspaceId: activeDocument.workspaceId,
      userId,
      workspaceType: activeDocument.workspaceType,
    })
    const documentIds = new Set<string>()

    collectDescendantDocumentIds(documentId, workspaceContext, documentIds)

    return Array.from(documentIds)
  }
}

function toDocumentTrashItem(
  document: PersistedDocument,
  context: WorkspaceDocumentContext,
  workspaceType: string,
): DocumentTrashItem {
  return {
    id: document.id,
    title: document.title,
    collection: resolveOwnedDocumentCollectionId({
      workspaceType,
      visibility: document.visibility,
    }),
    ancestorTitles: collectAncestorTitles(document, context),
    trashedAt: document.trashedAt?.toISOString() ?? '',
  }
}

function collectTrashedSubtreeDocumentIds(
  context: WorkspaceDocumentContext,
  rootId: string,
): string[] {
  const documentIds = new Set<string>()
  collectDescendantDocumentIds(rootId, context, documentIds)

  return Array.from(documentIds).filter(documentId => context.documentsById.get(documentId)?.trashedAt)
}

function assertTrashRootDocument(
  context: WorkspaceDocumentContext,
  documentId: string,
) {
  const document = context.documentsById.get(documentId)

  if (!document) {
    throw new NotFoundException(`Document "${documentId}" not found`)
  }

  if (document.parentId && context.documentsById.get(document.parentId)?.trashedAt) {
    throw new BadRequestException('请从已删除根文档开始操作')
  }
}
