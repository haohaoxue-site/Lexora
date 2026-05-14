import type {
  CreateDocumentVersionSnapshotRequest,
  CreateDocumentVersionSnapshotResponse,
  DocumentCurrent,
  DocumentCurrentProjection,
  DocumentShareProjection,
  DocumentVersionSnapshot,
  DocumentVersionSnapshotSource,
  MaterializeDocumentYdocCurrentProjectionRequest,
  MaterializeDocumentYdocCurrentProjectionResponse,
  RestoreDocumentVersionSnapshotRequest,
  RestoreDocumentVersionSnapshotResponse,
  TiptapJsonContent,
} from '@haohaoxue/samepage-contracts'
import {
  COLLAB_PERMISSION_INVALIDATION_REASON,
  DOCUMENT_VERSION_SNAPSHOT_SOURCE,
} from '@haohaoxue/samepage-contracts'
import {
  collectDocumentAssetIds,
  getDocumentTitlePlainText,
  hasUnresolvedDocumentAssets,
  stripDocumentAssetRuntimeAttributes,
  summarizeDocumentContent,
} from '@haohaoxue/samepage-shared'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../database/prisma.service'
import { CollabPermissionInvalidationPublisherService } from '../../../infrastructure/publisher/collab-permission-invalidation-publisher.service'
import { auditUserSummarySelect, toAuditUserSummary } from '../../users/audit-user-summary'
import { DocumentAssetsService } from '../asset/asset.service'
import { DocumentAccessService } from '../core/access.service'
import { RECENT_DOCUMENT_ROUTE_KIND, upsertRecentDocumentVisit } from '../core/recent-visit'
import { DocumentSharesService } from '../share/shares.service'
import { DocumentYdocsService } from './ydocs.service'

const documentCurrentProjectionSelect = {
  id: true,
  documentId: true,
  projectionRevision: true,
  runtimeEpoch: true,
  projectedUpdateSeq: true,
  checkpointSeq: true,
  checkpointUpdateSeq: true,
  schemaVersion: true,
  title: true,
  body: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DocumentCurrentProjectionSelect

const documentVersionSnapshotSelect = {
  id: true,
  documentId: true,
  version: true,
  basedOnProjectionRevision: true,
  runtimeEpoch: true,
  schemaVersion: true,
  title: true,
  body: true,
  source: true,
  restoredFromVersionSnapshotId: true,
  createdAt: true,
  createdBy: true,
  createdByUser: {
    select: auditUserSummarySelect,
  },
} satisfies Prisma.DocumentVersionSnapshotSelect

const documentCurrentSelect = {
  id: true,
  workspaceId: true,
  createdBy: true,
  visibility: true,
  parentId: true,
  title: true,
  currentProjectionId: true,
  currentProjectionRevision: true,
  latestVersionSnapshotId: true,
  summary: true,
  status: true,
  order: true,
  pageWidthMode: true,
  createdAt: true,
  updatedAt: true,
  currentProjection: {
    select: documentCurrentProjectionSelect,
  },
} satisfies Prisma.DocumentSelect

type PersistedDocumentCurrent = Prisma.DocumentGetPayload<{
  select: typeof documentCurrentSelect
}>

type PersistedDocumentCurrentProjection = Prisma.DocumentCurrentProjectionGetPayload<{
  select: typeof documentCurrentProjectionSelect
}>

type PersistedDocumentVersionSnapshot = Prisma.DocumentVersionSnapshotGetPayload<{
  select: typeof documentVersionSnapshotSelect
}>

/** 读取当前文档选项。 */
interface GetDocumentCurrentOptions {
  recordVisit?: boolean
}

@Injectable()
export class DocumentContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentAssetsService: DocumentAssetsService,
    private readonly documentAccessService: DocumentAccessService,
    private readonly documentSharesService: DocumentSharesService,
    private readonly documentYdocsService?: DocumentYdocsService,
    private readonly collabPermissionInvalidationPublisher?: CollabPermissionInvalidationPublisherService,
  ) {}

  async getDocumentCurrent(
    userId: string,
    id: string,
    options: GetDocumentCurrentOptions = {},
  ): Promise<DocumentCurrent> {
    const document = await this.loadReadableDocumentCurrent(userId, id)
    const current = await this.buildDocumentCurrent(document)

    if (options.recordVisit) {
      await this.recordDocumentVisit(userId, id)
    }

    return current
  }

  async materializeDocumentYdocCurrentProjection(
    id: string,
    payload: MaterializeDocumentYdocCurrentProjectionRequest,
  ): Promise<MaterializeDocumentYdocCurrentProjectionResponse> {
    if (!this.documentYdocsService) {
      throw new ConflictException('协作运行时持久化服务未初始化')
    }

    const documentYdocsService = this.documentYdocsService
    const persistableBody = stripDocumentAssetRuntimeAttributes(payload.body)
    this.assertPersistableDocumentAssets(persistableBody)
    await this.documentAssetsService.assertAssetsBelongToDocument({
      documentId: id,
      assetIds: collectDocumentAssetIds(persistableBody),
    })

    return await this.prisma.$transaction(async (tx) => {
      const currentDocument = await tx.document.findUnique({
        where: { id },
        select: {
          id: true,
          currentProjectionRevision: true,
        },
      })

      if (!currentDocument) {
        throw new NotFoundException(`Document "${id}" not found`)
      }

      const nextProjectionRevision = currentDocument.currentProjectionRevision + 1
      const projection = await tx.documentCurrentProjection.create({
        data: {
          documentId: id,
          projectionRevision: nextProjectionRevision,
          runtimeEpoch: payload.runtimeEpoch,
          projectedUpdateSeq: payload.checkpointUpdateSeq,
          checkpointSeq: payload.checkpointSeq,
          checkpointUpdateSeq: payload.checkpointUpdateSeq,
          schemaVersion: payload.schemaVersion,
          title: toPrismaJsonValue(payload.title),
          body: toPrismaJsonValue(persistableBody),
        },
        select: documentCurrentProjectionSelect,
      })

      await tx.document.update({
        where: { id },
        data: {
          currentProjectionId: projection.id,
          currentProjectionRevision: nextProjectionRevision,
          title: getDocumentTitlePlainText(payload.title),
          summary: summarizeDocumentContent(persistableBody, 120, ''),
        },
      })

      await documentYdocsService.recordDocumentYdocCurrentProjection(tx, {
        documentId: id,
        runtimeEpoch: payload.runtimeEpoch,
        checkpointSeq: payload.checkpointSeq,
        checkpointUpdateSeq: payload.checkpointUpdateSeq,
        lastProjectedProjectionId: projection.id,
        lastProjectedProjectionRevision: nextProjectionRevision,
      })

      return {
        projection: toDocumentCurrentProjection(projection),
        currentProjectionRevision: nextProjectionRevision,
      }
    })
  }

  async getDocumentVersionSnapshots(userId: string, id: string): Promise<DocumentVersionSnapshot[]> {
    await this.documentAccessService.assertCanReadDocument(userId, id)

    const snapshots = await this.prisma.documentVersionSnapshot.findMany({
      where: {
        documentId: id,
      },
      select: documentVersionSnapshotSelect,
      orderBy: {
        version: 'desc',
      },
    })

    return snapshots.map(toDocumentVersionSnapshot)
  }

  async createDocumentVersionSnapshot(
    userId: string,
    id: string,
    payload: CreateDocumentVersionSnapshotRequest,
  ): Promise<CreateDocumentVersionSnapshotResponse> {
    await this.documentAccessService.assertCanEditDocument(userId, id)

    const snapshot = await this.prisma.$transaction(async (tx) => {
      const currentDocument = await tx.document.findUnique({
        where: { id },
        select: {
          currentProjectionRevision: true,
          currentProjection: {
            select: documentCurrentProjectionSelect,
          },
        },
      })

      if (!currentDocument?.currentProjection) {
        throw new NotFoundException(`Document "${id}" current projection not found`)
      }

      if (currentDocument.currentProjectionRevision !== payload.basedOnProjectionRevision) {
        throw new ConflictException('文档当前投影已变化，请刷新后重试')
      }

      const nextVersion = await this.resolveNextVersionSnapshotNumber(tx, id)
      const createdSnapshot = await tx.documentVersionSnapshot.create({
        data: {
          documentId: id,
          version: nextVersion,
          basedOnProjectionRevision: currentDocument.currentProjection.projectionRevision,
          runtimeEpoch: currentDocument.currentProjection.runtimeEpoch,
          schemaVersion: currentDocument.currentProjection.schemaVersion,
          title: toPrismaJsonValue(currentDocument.currentProjection.title),
          body: toPrismaJsonValue(currentDocument.currentProjection.body),
          source: payload.source,
          createdBy: userId,
        },
        select: documentVersionSnapshotSelect,
      })

      await tx.document.update({
        where: { id },
        data: {
          latestVersionSnapshotId: createdSnapshot.id,
        },
      })

      return createdSnapshot
    })

    return {
      snapshot: toDocumentVersionSnapshot(snapshot),
      latestVersionSnapshotId: snapshot.id,
    }
  }

  async restoreDocumentVersionSnapshot(
    userId: string,
    id: string,
    payload: RestoreDocumentVersionSnapshotRequest,
  ): Promise<RestoreDocumentVersionSnapshotResponse> {
    await this.documentAccessService.assertCanEditDocument(userId, id)

    if (!this.documentYdocsService) {
      throw new ConflictException('协作运行时持久化服务未初始化')
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const [currentDocument, targetSnapshot] = await Promise.all([
        tx.document.findUnique({
          where: { id },
          select: {
            ...documentCurrentSelect,
          },
        }),
        tx.documentVersionSnapshot.findFirst({
          where: {
            documentId: id,
            id: payload.versionSnapshotId,
          },
          select: documentVersionSnapshotSelect,
        }),
      ])

      if (!currentDocument?.currentProjection) {
        throw new NotFoundException(`Document "${id}" current projection not found`)
      }

      if (!targetSnapshot) {
        throw new NotFoundException(`Version snapshot "${payload.versionSnapshotId}" not found`)
      }

      if (currentDocument.currentProjectionRevision !== payload.baseProjectionRevision) {
        throw new ConflictException('文档当前投影已变化，请刷新后重试')
      }

      const checkpointMetadata = await this.documentYdocsService!.resetDocumentYdocRuntimeFromVersionSnapshot(tx, {
        documentId: id,
        title: asTiptapJsonContent(targetSnapshot.title),
        body: asTiptapJsonContent(targetSnapshot.body),
      })
      const nextProjectionRevision = currentDocument.currentProjectionRevision + 1
      const projection = await tx.documentCurrentProjection.create({
        data: {
          documentId: id,
          projectionRevision: nextProjectionRevision,
          runtimeEpoch: checkpointMetadata.runtimeEpoch,
          projectedUpdateSeq: 0,
          checkpointSeq: checkpointMetadata.checkpointSeq,
          checkpointUpdateSeq: 0,
          schemaVersion: targetSnapshot.schemaVersion,
          title: toPrismaJsonValue(targetSnapshot.title),
          body: toPrismaJsonValue(targetSnapshot.body),
        },
        select: documentCurrentProjectionSelect,
      })
      const nextVersion = await this.resolveNextVersionSnapshotNumber(tx, id)
      const restoreSnapshot = await tx.documentVersionSnapshot.create({
        data: {
          documentId: id,
          version: nextVersion,
          basedOnProjectionRevision: nextProjectionRevision,
          runtimeEpoch: checkpointMetadata.runtimeEpoch,
          schemaVersion: targetSnapshot.schemaVersion,
          title: toPrismaJsonValue(targetSnapshot.title),
          body: toPrismaJsonValue(targetSnapshot.body),
          source: DOCUMENT_VERSION_SNAPSHOT_SOURCE.RESTORE,
          restoredFromVersionSnapshotId: targetSnapshot.id,
          createdBy: userId,
        },
        select: documentVersionSnapshotSelect,
      })

      await tx.document.update({
        where: { id },
        data: {
          currentProjectionId: projection.id,
          currentProjectionRevision: nextProjectionRevision,
          latestVersionSnapshotId: restoreSnapshot.id,
          title: getDocumentTitlePlainText(asTiptapJsonContent(targetSnapshot.title)),
          summary: summarizeDocumentContent(asTiptapJsonContent(targetSnapshot.body), 120, ''),
        },
      })

      await this.documentYdocsService!.recordDocumentYdocCurrentProjection(tx, {
        documentId: id,
        runtimeEpoch: checkpointMetadata.runtimeEpoch,
        checkpointSeq: checkpointMetadata.checkpointSeq,
        checkpointUpdateSeq: 0,
        lastProjectedProjectionId: projection.id,
        lastProjectedProjectionRevision: nextProjectionRevision,
      })

      const shareProjection = await this.documentSharesService.resolveDocumentShareProjectionForDocument(currentDocument)

      return {
        current: toDocumentCurrent({
          ...currentDocument,
          title: getDocumentTitlePlainText(asTiptapJsonContent(targetSnapshot.title)),
          summary: summarizeDocumentContent(asTiptapJsonContent(targetSnapshot.body), 120, ''),
          currentProjectionId: projection.id,
          currentProjectionRevision: nextProjectionRevision,
          latestVersionSnapshotId: restoreSnapshot.id,
          currentProjection: projection,
        }, shareProjection),
        snapshot: toDocumentVersionSnapshot(restoreSnapshot),
      }
    })

    await this.collabPermissionInvalidationPublisher?.publishPermissionInvalidations([{
      reason: COLLAB_PERMISSION_INVALIDATION_REASON.RUNTIME_EPOCH_EXPIRED,
      documentId: id,
    }])

    return result
  }

  private async loadReadableDocumentCurrent(userId: string, documentId: string): Promise<PersistedDocumentCurrent> {
    await this.documentAccessService.assertCanReadDocument(userId, documentId)
    return this.loadDocumentCurrentRecord(documentId)
  }

  private async loadDocumentCurrentRecord(documentId: string): Promise<PersistedDocumentCurrent> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: documentCurrentSelect,
    })

    if (!document?.currentProjection) {
      throw new NotFoundException(`Document "${documentId}" current projection not found`)
    }

    return document
  }

  private async buildDocumentCurrent(document: PersistedDocumentCurrent): Promise<DocumentCurrent> {
    const shareProjection = await this.documentSharesService.resolveDocumentShareProjectionForDocument(document)
    return toDocumentCurrent(document, shareProjection)
  }

  private async recordDocumentVisit(userId: string, documentId: string): Promise<void> {
    await upsertRecentDocumentVisit(this.prisma, {
      documentId,
      userId,
      routeKind: RECENT_DOCUMENT_ROUTE_KIND.DOCUMENT,
      routeEntryId: null,
    })
  }

  private async resolveNextVersionSnapshotNumber(tx: Prisma.TransactionClient, documentId: string): Promise<number> {
    const latest = await tx.documentVersionSnapshot.findFirst({
      where: {
        documentId,
      },
      orderBy: {
        version: 'desc',
      },
      select: {
        version: true,
      },
    })

    return (latest?.version ?? 0) + 1
  }

  private assertPersistableDocumentAssets(body: TiptapJsonContent) {
    if (hasUnresolvedDocumentAssets(body)) {
      throw new BadRequestException('正文中存在未上传完成的资源，请稍后重试')
    }
  }
}

function toDocumentCurrent(
  document: PersistedDocumentCurrent,
  share: DocumentShareProjection | null,
): DocumentCurrent {
  if (!document.currentProjection) {
    throw new NotFoundException(`Document "${document.id}" current projection not found`)
  }

  return {
    document: toDocumentRecord(document, share),
    currentProjection: toDocumentCurrentProjection(document.currentProjection),
  }
}

function toDocumentBase(document: PersistedDocumentCurrent) {
  return {
    id: document.id,
    summary: document.summary,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  }
}

function toDocumentRecord(
  document: PersistedDocumentCurrent,
  share: DocumentShareProjection | null,
) {
  return {
    ...toDocumentBase(document),
    workspaceId: document.workspaceId,
    createdBy: document.createdBy,
    visibility: document.visibility,
    parentId: document.parentId,
    currentProjectionId: document.currentProjectionId,
    currentProjectionRevision: document.currentProjectionRevision,
    latestVersionSnapshotId: document.latestVersionSnapshotId,
    order: document.order,
    status: document.status,
    pageWidthMode: document.pageWidthMode,
    share,
  }
}

function toDocumentCurrentProjection(projection: PersistedDocumentCurrentProjection): DocumentCurrentProjection {
  return {
    id: projection.id,
    documentId: projection.documentId,
    projectionRevision: projection.projectionRevision,
    runtimeEpoch: projection.runtimeEpoch,
    projectedUpdateSeq: projection.projectedUpdateSeq,
    checkpointSeq: projection.checkpointSeq,
    checkpointUpdateSeq: projection.checkpointUpdateSeq,
    schemaVersion: projection.schemaVersion as DocumentCurrentProjection['schemaVersion'],
    title: asTiptapJsonContent(projection.title),
    body: asTiptapJsonContent(projection.body),
    createdAt: projection.createdAt.toISOString(),
    updatedAt: projection.updatedAt.toISOString(),
  }
}

function toDocumentVersionSnapshot(snapshot: PersistedDocumentVersionSnapshot): DocumentVersionSnapshot {
  return {
    id: snapshot.id,
    documentId: snapshot.documentId,
    version: snapshot.version,
    basedOnProjectionRevision: snapshot.basedOnProjectionRevision,
    runtimeEpoch: snapshot.runtimeEpoch,
    schemaVersion: snapshot.schemaVersion as DocumentVersionSnapshot['schemaVersion'],
    title: asTiptapJsonContent(snapshot.title),
    body: asTiptapJsonContent(snapshot.body),
    source: snapshot.source as DocumentVersionSnapshotSource,
    restoredFromVersionSnapshotId: snapshot.restoredFromVersionSnapshotId,
    createdAt: snapshot.createdAt.toISOString(),
    createdBy: snapshot.createdBy,
    createdByUser: toAuditUserSummary(snapshot.createdByUser),
  }
}

function asTiptapJsonContent(value: Prisma.JsonValue): TiptapJsonContent {
  return (Array.isArray(value) ? value : []) as unknown as TiptapJsonContent
}

function toPrismaJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}
