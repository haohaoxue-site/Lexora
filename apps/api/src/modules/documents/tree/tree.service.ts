import type {
  CreateDocumentRequest,
  CreateDocumentResponse,
  DocumentBase,
  DocumentCurrent,
  DocumentItem,
  DocumentRecent,
  DocumentShareProjection,
  DocumentTreeGroup,
  DocumentVisibility,
  OwnedDocumentCollectionId,
  PatchDocumentLayoutRequest,
  PatchDocumentMetaRequest,
  TiptapJsonContent,
} from '@haohaoxue/samepage-contracts'
import type { PersistedDocument, WorkspaceDocumentContext } from '../core/documents.utils'
import {
  COLLAB_PERMISSION_INVALIDATION_REASON,
  DOCUMENT_COLLECTION,
  DOCUMENT_DEFAULT_TITLE,
  DOCUMENT_VERSION_SNAPSHOT_SOURCE,
  DOCUMENT_VISIBILITY,
  TIPTAP_SCHEMA_VERSION,
  WORKSPACE_TYPE,
} from '@haohaoxue/samepage-contracts'
import {
  buildDocumentPath,
  buildSharedDocumentPath,
  buildSharedDocumentRecipientPath,
  createDocumentTitleContent,
  createTiptapDocumentCollaborationCheckpointState,
  getDocumentTitlePlainText,
  resolveOwnedDocumentCollectionId,
  summarizeDocumentContent,
} from '@haohaoxue/samepage-shared'
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { DocumentStatus, Prisma } from '@prisma/client'
import { PrismaService } from '../../../database/prisma.service'
import { CollabPermissionInvalidationPublisherService } from '../../../infrastructure/publisher/collab-permission-invalidation-publisher.service'
import { DocumentContentService } from '../content/content.service'
import { DocumentAccessService } from '../core/access.service'
import {
  buildWorkspaceDocumentContext,
  canUserAccessWorkspaceDocument,
  collectAncestorTitles,
  collectDescendantDocumentIds,
  documentSelect,

} from '../core/documents.utils'
import { RECENT_DOCUMENT_ROUTE_KIND } from '../core/recent-visit'
import { DocumentShareRecipientsService } from '../share/share-recipients.service'
import { DocumentSharesService } from '../share/shares.service'

const RECENT_DOCUMENT_LIMIT = 8

const documentRecentVisitSelect = {
  documentId: true,
  routeKind: true,
  routeEntryId: true,
  visitedAt: true,
  document: {
    select: documentSelect,
  },
} satisfies Prisma.DocumentRecentVisitSelect

type PersistedDocumentRecentVisit = Prisma.DocumentRecentVisitGetPayload<{
  select: typeof documentRecentVisitSelect
}>

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentAccessService: DocumentAccessService,
    private readonly documentShareRecipientsService: DocumentShareRecipientsService,
    private readonly documentSharesService: DocumentSharesService,
    private readonly collabPermissionInvalidationPublisher: CollabPermissionInvalidationPublisherService,
    private readonly documentContentService: DocumentContentService,
  ) {}

  async createDocument(userId: string, payload: CreateDocumentRequest): Promise<CreateDocumentResponse> {
    const workspace = await this.documentAccessService.assertAccessibleWorkspace(userId, payload.workspaceId)
    const normalizedParentId = payload.parentId ?? null
    let nextVisibility = normalizeDocumentVisibilityForWorkspace({
      workspaceType: workspace.type,
      requestedVisibility: payload.visibility,
    })

    if (normalizedParentId) {
      const parentDocument = await this.documentAccessService.assertCanEditDocument(userId, normalizedParentId)

      if (parentDocument.workspaceId !== workspace.id) {
        throw new BadRequestException('父文档与目标空间不一致')
      }

      nextVisibility = parentDocument.visibility
    }

    const lastSibling = await this.prisma.document.findFirst({
      where: {
        workspaceId: workspace.id,
        parentId: normalizedParentId,
      },
      orderBy: {
        order: 'desc',
      },
      select: {
        order: true,
      },
    })

    const title = createDocumentTitleContent(payload.title.trim() || DOCUMENT_DEFAULT_TITLE)
    const body: TiptapJsonContent = []

    const document = await this.prisma.$transaction(async (tx) => {
      const createdDocument = await tx.document.create({
        data: {
          workspaceId: workspace.id,
          createdBy: userId,
          visibility: nextVisibility,
          parentId: normalizedParentId,
          title: getDocumentTitlePlainText(title),
          summary: summarizeDocumentContent(body, 120, ''),
          order: (lastSibling?.order ?? -1) + 1,
        },
        select: {
          id: true,
        },
      })

      const checkpointState = createTiptapDocumentCollaborationCheckpointState({
        title,
        body,
      })
      const currentProjection = await tx.documentCurrentProjection.create({
        data: {
          documentId: createdDocument.id,
          projectionRevision: 1,
          runtimeEpoch: 1,
          projectedUpdateSeq: 0,
          checkpointSeq: 1,
          checkpointUpdateSeq: 0,
          schemaVersion: TIPTAP_SCHEMA_VERSION,
          title: toPrismaJsonValue(title),
          body: toPrismaJsonValue(body),
        },
        select: {
          id: true,
        },
      })

      const versionSnapshot = await tx.documentVersionSnapshot.create({
        data: {
          documentId: createdDocument.id,
          version: 1,
          basedOnProjectionRevision: 1,
          runtimeEpoch: 1,
          schemaVersion: TIPTAP_SCHEMA_VERSION,
          title: toPrismaJsonValue(title),
          body: toPrismaJsonValue(body),
          source: DOCUMENT_VERSION_SNAPSHOT_SOURCE.INITIAL,
          createdBy: userId,
        },
        select: {
          id: true,
        },
      })

      await tx.documentYdoc.create({
        data: {
          documentId: createdDocument.id,
          checkpointState: toPrismaBytes(checkpointState),
          checkpointSeq: 1,
          checkpointUpdateSeq: 0,
          updateSeq: 0,
          lastProjectedProjectionId: currentProjection.id,
          lastProjectedProjectionRevision: 1,
          lastProjectedAt: new Date(),
        },
      })

      await tx.document.update({
        where: {
          id: createdDocument.id,
        },
        data: {
          currentProjectionId: currentProjection.id,
          currentProjectionRevision: 1,
          latestVersionSnapshotId: versionSnapshot.id,
        },
      })

      return createdDocument
    })

    return {
      id: document.id,
    }
  }

  async getDocumentTree(userId: string, workspaceId: string): Promise<DocumentTreeGroup[]> {
    const workspace = await this.documentAccessService.assertAccessibleWorkspace(userId, workspaceId)
    const context = await this.loadWorkspaceDocumentContext({
      workspaceId: workspace.id,
      workspaceType: workspace.type,
      userId,
    })
    const shareProjectionByDocumentId = await this.documentSharesService.buildDocumentShareProjectionMap(context.documents)

    if (workspace.type === WORKSPACE_TYPE.TEAM) {
      return [
        {
          id: DOCUMENT_COLLECTION.PERSONAL,
          nodes: this.buildWorkspaceGroup(
            context,
            shareProjectionByDocumentId,
            DOCUMENT_COLLECTION.PERSONAL,
            workspace.type,
          ),
        },
        {
          id: DOCUMENT_COLLECTION.TEAM,
          nodes: this.buildWorkspaceGroup(
            context,
            shareProjectionByDocumentId,
            DOCUMENT_COLLECTION.TEAM,
            workspace.type,
          ),
        },
      ]
    }

    return [
      {
        id: DOCUMENT_COLLECTION.PERSONAL,
        nodes: this.buildWorkspaceGroup(
          context,
          shareProjectionByDocumentId,
          DOCUMENT_COLLECTION.PERSONAL,
          workspace.type,
        ),
      },
    ]
  }

  async getRecentDocuments(userId: string): Promise<DocumentRecent[]> {
    const recentVisits = await this.prisma.documentRecentVisit.findMany({
      where: {
        userId,
      },
      orderBy: {
        visitedAt: 'desc',
      },
      take: RECENT_DOCUMENT_LIMIT * 3,
      select: documentRecentVisitSelect,
    })

    if (!recentVisits.length) {
      return []
    }

    const recentShareIds = recentVisits
      .filter((visit) => {
        return (
          visit.routeKind === RECENT_DOCUMENT_ROUTE_KIND.SHARE
          && typeof visit.routeEntryId === 'string'
          && visit.routeEntryId.trim().length > 0
        )
      })
      .map(visit => visit.routeEntryId!.trim())
    const recentShareRecipientIds = recentVisits
      .filter((visit) => {
        return (
          visit.routeKind === RECENT_DOCUMENT_ROUTE_KIND.SHARE_RECIPIENT
          && typeof visit.routeEntryId === 'string'
          && visit.routeEntryId.trim().length > 0
        )
      })
      .map(visit => visit.routeEntryId!.trim())
    const [workspaces, activeRecentShareIds, activeRecentShareRecipientIds] = await Promise.all([
      this.documentAccessService.listAccessibleWorkspaces(userId),
      this.documentShareRecipientsService.resolveActiveShareIds(userId, recentShareIds),
      this.documentShareRecipientsService.resolveActiveShareRecipientIds(userId, recentShareRecipientIds),
    ])

    const workspaceIds = workspaces.map(workspace => workspace.id)
    const workspaceTypeById = new Map(
      workspaces.map(workspace => [workspace.id, workspace.type]),
    )
    const documents = await this.prisma.document.findMany({
      where: {
        workspaceId: {
          in: workspaceIds,
        },
        status: {
          in: [DocumentStatus.ACTIVE, DocumentStatus.LOCKED],
        },
        trashedAt: null,
      },
      select: documentSelect,
    })
    const context = buildWorkspaceDocumentContext(documents)
    const shareProjectionByDocumentId = await this.documentSharesService.buildDocumentShareProjectionMap(context.documents)

    return recentVisits
      .map((visit) => {
        if (visit.document.trashedAt) {
          return null
        }

        if (visit.routeKind === RECENT_DOCUMENT_ROUTE_KIND.SHARE) {
          const shareId = visit.routeEntryId?.trim()

          if (!shareId || !activeRecentShareIds.has(shareId)) {
            return null
          }

          if (!visit.document.title.trim() && !visit.document.summary.trim()) {
            return null
          }

          return toShareDocumentRecent(visit.document, buildSharedDocumentPath(shareId))
        }

        if (visit.routeKind === RECENT_DOCUMENT_ROUTE_KIND.SHARE_RECIPIENT) {
          const recipientId = visit.routeEntryId?.trim()

          if (!recipientId || !activeRecentShareRecipientIds.has(recipientId)) {
            return null
          }

          if (!visit.document.title.trim() && !visit.document.summary.trim()) {
            return null
          }

          return toShareDocumentRecent(visit.document, buildSharedDocumentRecipientPath(recipientId))
        }

        const document = context.documentsById.get(visit.documentId)

        if (!document) {
          return null
        }

        const workspaceType = workspaceTypeById.get(document.workspaceId)

        if (!canUserAccessWorkspaceDocument({
          userId,
          workspaceType,
          visibility: document.visibility,
          createdBy: document.createdBy,
        })) {
          return null
        }

        if (!document.title.trim() && !document.summary.trim()) {
          return null
        }

        return toDocumentRecent(
          document,
          context,
          workspaceTypeById,
          shareProjectionByDocumentId.get(document.id) ?? null,
          buildDocumentPath(document.id),
        )
      })
      .filter((document): document is DocumentRecent =>
        document !== null && document.collection !== DOCUMENT_COLLECTION.TEAM,
      )
      .slice(0, RECENT_DOCUMENT_LIMIT)
  }

  async patchDocumentMeta(
    userId: string,
    id: string,
    payload: PatchDocumentMetaRequest,
  ): Promise<DocumentCurrent> {
    const document = await this.documentAccessService.assertCanEditDocument(userId, id)
    let nextParentId = document.parentId
    let nextVisibility = document.visibility

    if (payload.parentId !== undefined) {
      if (payload.parentId === id) {
        throw new BadRequestException('文档不能移动到自身下方')
      }

      nextParentId = payload.parentId

      if (payload.parentId) {
        const parentDocument = await this.documentAccessService.assertCanEditDocument(userId, payload.parentId)

        if (parentDocument.workspaceId !== document.workspaceId) {
          throw new BadRequestException('不允许跨空间移动文档')
        }

        nextVisibility = parentDocument.visibility
      }
    }

    if (payload.visibility !== undefined && nextParentId === null) {
      if (document.workspaceType !== WORKSPACE_TYPE.TEAM) {
        nextVisibility = DOCUMENT_VISIBILITY.PRIVATE
      }
      else {
        if (document.createdBy !== userId) {
          throw new ForbiddenException('仅创建者可以调整文档可见性')
        }

        nextVisibility = payload.visibility
      }
    }

    if (payload.visibility !== undefined && nextParentId !== null && payload.parentId === undefined) {
      throw new BadRequestException('非根文档不支持单独调整可见性')
    }

    const context = await this.loadWorkspaceDocumentContext({
      workspaceId: document.workspaceId,
      workspaceType: document.workspaceType,
      userId,
    })
    const descendantDocumentIds = new Set<string>()

    collectDescendantDocumentIds(id, context, descendantDocumentIds)
    descendantDocumentIds.delete(id)
    const shouldInvalidateCollabConnections
      = nextVisibility === DOCUMENT_VISIBILITY.PRIVATE && nextVisibility !== document.visibility
    const invalidationTargetIds = shouldInvalidateCollabConnections
      ? [id, ...Array.from(descendantDocumentIds)]
      : []

    await this.prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id },
        data: {
          parentId: nextParentId,
          visibility: nextVisibility,
        },
      })

      if (descendantDocumentIds.size > 0 && nextVisibility !== document.visibility) {
        await tx.document.updateMany({
          where: {
            id: {
              in: Array.from(descendantDocumentIds),
            },
          },
          data: {
            visibility: nextVisibility,
          },
        })
      }
    })

    if (invalidationTargetIds.length > 0) {
      await this.collabPermissionInvalidationPublisher.publishPermissionInvalidations(
        invalidationTargetIds.map(documentId => ({
          reason: COLLAB_PERMISSION_INVALIDATION_REASON.DOCUMENT_TRASHED,
          documentId,
        })),
      )
    }

    return await this.documentContentService.getDocumentCurrent(userId, id)
  }

  async patchDocumentLayout(
    userId: string,
    id: string,
    payload: PatchDocumentLayoutRequest,
  ): Promise<DocumentCurrent> {
    await this.documentAccessService.assertCanEditDocument(userId, id)
    await this.prisma.document.update({
      where: { id },
      data: {
        pageWidthMode: payload.pageWidthMode,
      },
    })

    return await this.documentContentService.getDocumentCurrent(userId, id)
  }

  private async loadWorkspaceDocumentContext(input: {
    workspaceId: string
    workspaceType: string
    userId: string
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

  private buildWorkspaceGroup(
    context: WorkspaceDocumentContext,
    shareProjectionByDocumentId: ReadonlyMap<string, DocumentShareProjection>,
    collectionId: OwnedDocumentCollectionId,
    workspaceType: string,
  ): DocumentItem[] {
    return (context.childrenByParent.get(null) ?? [])
      .filter(document =>
        resolveOwnedDocumentCollectionId({
          workspaceType,
          visibility: document.visibility,
        }) === collectionId,
      )
      .map(document =>
        this.buildWorkspaceBranch(
          document,
          context,
          shareProjectionByDocumentId,
          workspaceType,
        ),
      )
  }

  private buildWorkspaceBranch(
    document: PersistedDocument,
    context: WorkspaceDocumentContext,
    shareProjectionByDocumentId: ReadonlyMap<string, DocumentShareProjection>,
    workspaceType: string,
  ): DocumentItem {
    const collectionId = resolveOwnedDocumentCollectionId({
      workspaceType,
      visibility: document.visibility,
    })
    const children = (context.childrenByParent.get(document.id) ?? [])
      .filter(child =>
        resolveOwnedDocumentCollectionId({
          workspaceType,
          visibility: child.visibility,
        }) === collectionId,
      )
      .map(child =>
        this.buildWorkspaceBranch(
          child,
          context,
          shareProjectionByDocumentId,
          workspaceType,
        ),
      )

    return {
      ...toDocumentBase(document),
      parentId: document.parentId,
      share: shareProjectionByDocumentId.get(document.id) ?? null,
      hasChildren: children.length > 0,
      hasContent: Boolean(document.currentProjectionId) && document.summary.length > 0,
      children,
    }
  }
}

function toDocumentBase(document: PersistedDocument): DocumentBase {
  return {
    id: document.id,
    title: document.title,
    summary: document.summary,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  }
}

function toDocumentRecent(
  document: PersistedDocument,
  context: WorkspaceDocumentContext,
  workspaceTypeById: ReadonlyMap<string, string>,
  share: DocumentShareProjection | null,
  link: string,
): DocumentRecent {
  const workspaceType = workspaceTypeById.get(document.workspaceId)

  return {
    id: document.id,
    title: document.title,
    collection: resolveOwnedDocumentCollectionId({
      workspaceType,
      visibility: document.visibility,
    }),
    ancestorTitles: collectAncestorTitles(document, context),
    link,
    share,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  }
}

function toShareDocumentRecent(
  document: PersistedDocumentRecentVisit['document'],
  link: string,
): DocumentRecent {
  return {
    id: document.id,
    title: document.title,
    collection: DOCUMENT_COLLECTION.SHARE,
    ancestorTitles: [],
    link,
    share: null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  }
}

function normalizeDocumentVisibilityForWorkspace(input: {
  workspaceType: string
  requestedVisibility: DocumentVisibility | undefined
}): DocumentVisibility {
  if (input.workspaceType !== WORKSPACE_TYPE.TEAM) {
    return DOCUMENT_VISIBILITY.PRIVATE
  }

  return input.requestedVisibility === DOCUMENT_VISIBILITY.WORKSPACE
    ? DOCUMENT_VISIBILITY.WORKSPACE
    : DOCUMENT_VISIBILITY.PRIVATE
}

function toPrismaJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

function toPrismaBytes(payload: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(payload)
}
