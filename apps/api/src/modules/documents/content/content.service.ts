import type {
  CreateDocumentVersionSnapshotRequest,
  CreateDocumentVersionSnapshotResponse,
  DocumentCurrent,
  DocumentCurrentProjection,
  DocumentHistory,
  DocumentVersionSnapshot,
  DocumentVersionSnapshotSource,
  MaterializeDocumentYdocCurrentProjectionRequest,
  MaterializeDocumentYdocCurrentProjectionResponse,
  PatchDocumentTitleRequest,
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
  createDocumentTitleContent,
  getDocumentTitlePlainText,
  hasUnresolvedDocumentAssets,
  isSameDocumentVersionSnapshotContent,
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
import { DocumentYdocsService } from './ydocs.service'

const AUTO_VERSION_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000

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
  basedOnProjectionId: true,
  basedOnProjectionRevision: true,
  runtimeEpoch: true,
  projectedUpdateSeq: true,
  checkpointSeq: true,
  checkpointUpdateSeq: true,
  schemaVersion: true,
  title: true,
  body: true,
  source: true,
  restoredFromVersionSnapshotId: true,
  idempotencyKey: true,
  label: true,
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

interface CreateVersionSnapshotFromProjectionInput {
  documentId: string
  projection: PersistedDocumentCurrentProjection
  source: DocumentVersionSnapshotSource
  createdBy: string | null
  restoredFromVersionSnapshotId?: string | null
  idempotencyKey?: string | null
  label?: string | null
  createdAt?: Date
}

@Injectable()
export class DocumentContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentAssetsService: DocumentAssetsService,
    private readonly documentAccessService: DocumentAccessService,
    private readonly documentYdocsService?: DocumentYdocsService,
    private readonly collabPermissionInvalidationPublisher?: CollabPermissionInvalidationPublisherService,
  ) {}

  async getDocumentCurrent(
    userId: string,
    id: string,
  ): Promise<DocumentCurrent> {
    const accessibleDocument = await this.documentAccessService.assertCanReadDocument(userId, id)
    const document = await this.loadDocumentCurrentRecord(id)
    return toDocumentCurrent(document, accessibleDocument.access)
  }

  async patchDocumentTitle(
    userId: string,
    id: string,
    payload: PatchDocumentTitleRequest,
  ): Promise<DocumentCurrent> {
    const accessibleDocument = await this.documentAccessService.assertCanEditDocument(userId, id)

    if (!this.documentYdocsService) {
      throw new ConflictException('协作运行时持久化服务未初始化')
    }

    const nextTitle = createDocumentTitleContent(payload.title)
    const result = await this.prisma.$transaction(async (tx) => {
      const currentDocument = await tx.document.findUnique({
        where: { id },
        select: documentCurrentSelect,
      })

      if (!currentDocument?.currentProjection) {
        throw new NotFoundException(`Document "${id}" current projection not found`)
      }

      const resetResult = await this.documentYdocsService!.resetDocumentYdocRuntimeWithTitle(tx, {
        documentId: id,
        title: nextTitle,
        bodyWhenYdocMissing: asTiptapJsonContent(currentDocument.currentProjection.body),
      })
      const checkpointMetadata = resetResult.metadata
      const body = stripDocumentAssetRuntimeAttributes(resetResult.projection.body)
      const titleText = getDocumentTitlePlainText(resetResult.projection.title)
      const nextProjectionRevision = currentDocument.currentProjectionRevision + 1
      const projection = await tx.documentCurrentProjection.create({
        data: {
          documentId: id,
          projectionRevision: nextProjectionRevision,
          runtimeEpoch: checkpointMetadata.runtimeEpoch,
          projectedUpdateSeq: 0,
          checkpointSeq: checkpointMetadata.checkpointSeq,
          checkpointUpdateSeq: 0,
          schemaVersion: currentDocument.currentProjection.schemaVersion,
          title: toPrismaJsonValue(resetResult.projection.title),
          body: toPrismaJsonValue(body),
        },
        select: documentCurrentProjectionSelect,
      })
      const document = await tx.document.update({
        where: { id },
        data: {
          currentProjectionId: projection.id,
          currentProjectionRevision: nextProjectionRevision,
          summary: summarizeDocumentContent(body, 120, ''),
          title: titleText,
        },
        select: documentCurrentSelect,
      })

      await this.documentYdocsService!.recordDocumentYdocCurrentProjection(tx, {
        documentId: id,
        runtimeEpoch: checkpointMetadata.runtimeEpoch,
        checkpointSeq: checkpointMetadata.checkpointSeq,
        checkpointUpdateSeq: 0,
        lastProjectedProjectionId: projection.id,
        lastProjectedProjectionRevision: nextProjectionRevision,
      })

      return {
        ...document,
        currentProjection: projection,
      }
    })
    await this.collabPermissionInvalidationPublisher?.publishPermissionInvalidations([{
      reason: COLLAB_PERMISSION_INVALIDATION_REASON.RUNTIME_EPOCH_EXPIRED,
      documentId: id,
    }])

    return toDocumentCurrent(result, accessibleDocument.access)
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

      await this.maybeCreateAutoVersionSnapshotFromProjection(tx, {
        documentId: id,
        projection,
      })

      return {
        projection: toDocumentCurrentProjection(projection),
        currentProjectionRevision: nextProjectionRevision,
      }
    })
  }

  async getDocumentVersionSnapshots(userId: string, id: string): Promise<DocumentVersionSnapshot[]> {
    await this.documentAccessService.assertCanReadDocument(userId, id)

    const snapshots = await this.loadDocumentVersionSnapshots(id)

    return snapshots.map(toDocumentVersionSnapshot)
  }

  async getDocumentHistory(userId: string, id: string): Promise<DocumentHistory> {
    await this.documentAccessService.assertCanReadDocument(userId, id)
    const document = await this.loadDocumentCurrentRecord(id)
    const snapshots = await this.loadDocumentVersionSnapshots(id)
    const currentProjection = document.currentProjection

    if (!currentProjection) {
      throw new NotFoundException(`Document "${id}" current projection not found`)
    }

    const matchedVersionSnapshot = snapshots.find(snapshot => isVersionSnapshotContentSameAsProjection(snapshot, currentProjection)) ?? null

    return {
      current: {
        projectionRevision: document.currentProjectionRevision,
        runtimeEpoch: currentProjection.runtimeEpoch,
        updatedAt: currentProjection.updatedAt.toISOString(),
        matchedVersionSnapshotId: matchedVersionSnapshot?.id ?? null,
        hasUnversionedChanges: !matchedVersionSnapshot,
      },
      snapshots: snapshots.map(toDocumentVersionSnapshot),
    }
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

      return await this.createVersionSnapshotFromProjection(tx, {
        documentId: id,
        projection: currentDocument.currentProjection,
        source: payload.source,
        createdBy: userId,
        idempotencyKey: payload.idempotencyKey ?? null,
        label: payload.label ?? null,
      })
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
    const accessibleDocument = await this.documentAccessService.assertCanEditDocument(userId, id)

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
      const restoreSnapshot = await this.createVersionSnapshotFromProjection(tx, {
        documentId: id,
        projection,
        source: DOCUMENT_VERSION_SNAPSHOT_SOURCE.RESTORE,
        restoredFromVersionSnapshotId: targetSnapshot.id,
        createdBy: userId,
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

      return {
        current: toDocumentCurrent({
          ...currentDocument,
          title: getDocumentTitlePlainText(asTiptapJsonContent(targetSnapshot.title)),
          summary: summarizeDocumentContent(asTiptapJsonContent(targetSnapshot.body), 120, ''),
          currentProjectionId: projection.id,
          currentProjectionRevision: nextProjectionRevision,
          latestVersionSnapshotId: restoreSnapshot.id,
          currentProjection: projection,
        }, accessibleDocument.access),
        snapshot: toDocumentVersionSnapshot(restoreSnapshot),
      }
    })

    await this.collabPermissionInvalidationPublisher?.publishPermissionInvalidations([{
      reason: COLLAB_PERMISSION_INVALIDATION_REASON.RUNTIME_EPOCH_EXPIRED,
      documentId: id,
    }])

    return result
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

  private async loadDocumentVersionSnapshots(documentId: string): Promise<PersistedDocumentVersionSnapshot[]> {
    return await this.prisma.documentVersionSnapshot.findMany({
      where: {
        documentId,
      },
      select: documentVersionSnapshotSelect,
      orderBy: {
        version: 'desc',
      },
    })
  }

  private async maybeCreateAutoVersionSnapshotFromProjection(
    tx: Prisma.TransactionClient,
    input: {
      documentId: string
      projection: PersistedDocumentCurrentProjection
    },
  ): Promise<PersistedDocumentVersionSnapshot | null> {
    const latestSnapshot = await tx.documentVersionSnapshot.findFirst({
      where: {
        documentId: input.documentId,
      },
      orderBy: {
        version: 'desc',
      },
      select: documentVersionSnapshotSelect,
    })

    if (latestSnapshot && isVersionSnapshotContentSameAsProjection(latestSnapshot, input.projection)) {
      return null
    }

    const shouldCreateInitialAutoSnapshot = latestSnapshot?.source === DOCUMENT_VERSION_SNAPSHOT_SOURCE.INITIAL
    const shouldCreateScheduledAutoSnapshot = !latestSnapshot
      || input.projection.createdAt.getTime() - latestSnapshot.createdAt.getTime() >= AUTO_VERSION_SNAPSHOT_INTERVAL_MS

    if (!shouldCreateInitialAutoSnapshot && !shouldCreateScheduledAutoSnapshot) {
      return null
    }

    return await this.createVersionSnapshotFromProjection(tx, {
      documentId: input.documentId,
      projection: input.projection,
      source: DOCUMENT_VERSION_SNAPSHOT_SOURCE.AUTO,
      createdBy: null,
      idempotencyKey: createAutoVersionSnapshotIdempotencyKey(input.projection),
    })
  }

  private async createVersionSnapshotFromProjection(
    tx: Prisma.TransactionClient,
    input: CreateVersionSnapshotFromProjectionInput,
  ): Promise<PersistedDocumentVersionSnapshot> {
    if (input.idempotencyKey) {
      const existingSnapshot = await tx.documentVersionSnapshot.findFirst({
        where: {
          documentId: input.documentId,
          idempotencyKey: input.idempotencyKey,
        },
        select: documentVersionSnapshotSelect,
      })

      if (existingSnapshot) {
        return existingSnapshot
      }
    }

    await this.lockVersionSnapshotSequence(tx, input.documentId)

    if (input.idempotencyKey) {
      const existingSnapshot = await tx.documentVersionSnapshot.findFirst({
        where: {
          documentId: input.documentId,
          idempotencyKey: input.idempotencyKey,
        },
        select: documentVersionSnapshotSelect,
      })

      if (existingSnapshot) {
        return existingSnapshot
      }
    }

    const nextVersion = await this.allocateNextVersionSnapshotNumber(tx, input.documentId)
    const createdSnapshot = await tx.documentVersionSnapshot.create({
      data: {
        documentId: input.documentId,
        version: nextVersion,
        basedOnProjectionId: input.projection.id,
        basedOnProjectionRevision: input.projection.projectionRevision,
        runtimeEpoch: input.projection.runtimeEpoch,
        projectedUpdateSeq: input.projection.projectedUpdateSeq,
        checkpointSeq: input.projection.checkpointSeq,
        checkpointUpdateSeq: input.projection.checkpointUpdateSeq,
        schemaVersion: input.projection.schemaVersion,
        title: toPrismaJsonValue(input.projection.title),
        body: toPrismaJsonValue(input.projection.body),
        source: input.source,
        restoredFromVersionSnapshotId: input.restoredFromVersionSnapshotId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        label: input.label ?? null,
        createdAt: input.createdAt,
        createdBy: input.createdBy,
      },
      select: documentVersionSnapshotSelect,
    })

    await tx.document.update({
      where: { id: input.documentId },
      data: {
        latestVersionSnapshotId: createdSnapshot.id,
      },
    })

    return createdSnapshot
  }

  private async lockVersionSnapshotSequence(tx: Prisma.TransactionClient, documentId: string): Promise<void> {
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id"
      FROM "Document"
      WHERE "id" = ${documentId}
      FOR UPDATE
    `)

    if (rows.length === 0) {
      throw new NotFoundException(`Document "${documentId}" not found`)
    }
  }

  private async allocateNextVersionSnapshotNumber(tx: Prisma.TransactionClient, documentId: string): Promise<number> {
    const document = await tx.document.update({
      where: { id: documentId },
      data: {
        versionSnapshotSeq: {
          increment: 1,
        },
      },
      select: {
        versionSnapshotSeq: true,
      },
    })

    return document.versionSnapshotSeq
  }

  private assertPersistableDocumentAssets(body: TiptapJsonContent) {
    if (hasUnresolvedDocumentAssets(body)) {
      throw new BadRequestException('正文中存在未上传完成的资源，请稍后重试')
    }
  }
}

function toDocumentCurrent(
  document: PersistedDocumentCurrent,
  access: Awaited<ReturnType<DocumentAccessService['assertCanReadDocument']>>['access'],
): DocumentCurrent {
  if (!document.currentProjection) {
    throw new NotFoundException(`Document "${document.id}" current projection not found`)
  }

  return {
    document: toDocumentRecord(document, access),
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
  access: Awaited<ReturnType<DocumentAccessService['assertCanReadDocument']>>['access'],
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
    access,
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
    basedOnProjectionId: snapshot.basedOnProjectionId,
    basedOnProjectionRevision: snapshot.basedOnProjectionRevision,
    runtimeEpoch: snapshot.runtimeEpoch,
    projectedUpdateSeq: snapshot.projectedUpdateSeq,
    checkpointSeq: snapshot.checkpointSeq,
    checkpointUpdateSeq: snapshot.checkpointUpdateSeq,
    schemaVersion: snapshot.schemaVersion as DocumentVersionSnapshot['schemaVersion'],
    title: asTiptapJsonContent(snapshot.title),
    body: asTiptapJsonContent(snapshot.body),
    source: snapshot.source as DocumentVersionSnapshotSource,
    restoredFromVersionSnapshotId: snapshot.restoredFromVersionSnapshotId,
    idempotencyKey: snapshot.idempotencyKey,
    label: snapshot.label,
    createdAt: snapshot.createdAt.toISOString(),
    createdBy: snapshot.createdBy,
    createdByUser: toAuditUserSummary(snapshot.createdByUser),
  }
}

function isVersionSnapshotContentSameAsProjection(
  snapshot: PersistedDocumentVersionSnapshot,
  projection: PersistedDocumentCurrentProjection,
): boolean {
  return isSameDocumentVersionSnapshotContent(
    {
      schemaVersion: snapshot.schemaVersion as DocumentVersionSnapshot['schemaVersion'],
      title: asTiptapJsonContent(snapshot.title),
      body: asTiptapJsonContent(snapshot.body),
    },
    {
      schemaVersion: projection.schemaVersion as DocumentVersionSnapshot['schemaVersion'],
      title: asTiptapJsonContent(projection.title),
      body: asTiptapJsonContent(projection.body),
    },
  )
}

function createAutoVersionSnapshotIdempotencyKey(projection: PersistedDocumentCurrentProjection): string {
  return `auto:projection:${projection.projectionRevision}`
}

function asTiptapJsonContent(value: Prisma.JsonValue): TiptapJsonContent {
  return (Array.isArray(value) ? value : []) as unknown as TiptapJsonContent
}

function toPrismaJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}
