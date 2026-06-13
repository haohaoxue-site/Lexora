import type {
  DocumentYdocCheckpointMetadata,
  DocumentYdocRuntimeState,
  PersistDocumentYdocUpdateRequest,
  PersistDocumentYdocUpdateResponse,
  TiptapJsonContent,
} from '@haohaoxue/lexora-contracts'
import { COLLAB_ERROR_CODE } from '@haohaoxue/lexora-contracts'
import {
  createTiptapDocumentCollaborationCheckpointState,
  createTiptapDocumentCollaborationTitlePatchCheckpoint,
  resolveYdocRuntimeEpochError,
  resolveYdocUpdateSequenceError,
  toDocumentYdocCheckpointMetadata,
  toDocumentYdocUpdateRecord,
} from '@haohaoxue/lexora-shared'
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../database/prisma.service'

const documentYdocSelect = {
  documentId: true,
  ydocFormatVersion: true,
  runtimeEpoch: true,
  checkpointState: true,
  checkpointSeq: true,
  checkpointUpdateSeq: true,
  updateSeq: true,
  lastProjectedProjectionId: true,
  lastProjectedProjectionRevision: true,
  lastProjectedAt: true,
  updatedAt: true,
} satisfies Prisma.DocumentYdocSelect

const documentYdocUpdateSelect = {
  id: true,
  documentId: true,
  runtimeEpoch: true,
  seq: true,
  idempotencyKey: true,
  clientId: true,
  update: true,
  createdBy: true,
  createdAt: true,
} satisfies Prisma.DocumentYdocUpdateSelect

type PersistedDocumentYdoc = Prisma.DocumentYdocGetPayload<{
  select: typeof documentYdocSelect
}>

/** 替换 DocumentYdoc checkpoint 的输入。 */
interface ReplaceDocumentYdocCheckpointInput {
  documentId: string
  runtimeEpoch: number
  checkpointState: Uint8Array
  checkpointUpdateSeq: number
  lastProjectedProjectionId: string | null
  lastProjectedProjectionRevision: number
}

/** 从历史版本重置 DocumentYdoc runtime 的输入。 */
interface ResetDocumentYdocRuntimeFromVersionSnapshotInput {
  documentId: string
  title: TiptapJsonContent
  body: TiptapJsonContent
}

/** 用当前 Ydoc 状态替换标题并重置 runtime 的输入。 */
interface ResetDocumentYdocRuntimeWithTitleInput {
  documentId: string
  title: TiptapJsonContent
  /** 没有 Ydoc checkpoint 时用于重建完整基线，不作为重命名目标。 */
  bodyWhenYdocMissing: TiptapJsonContent
}

/** 用当前 Ydoc 状态替换标题并重置 runtime 的结果。 */
interface ResetDocumentYdocRuntimeWithTitleResult {
  metadata: DocumentYdocCheckpointMetadata
  projection: {
    title: TiptapJsonContent
    body: TiptapJsonContent
  }
}

/** 记录 DocumentYdoc 到当前读模型投影结果的输入。 */
interface RecordDocumentYdocCurrentProjectionInput {
  documentId: string
  runtimeEpoch: number
  checkpointSeq: number
  checkpointUpdateSeq: number
  lastProjectedProjectionId: string
  lastProjectedProjectionRevision: number
}

@Injectable()
export class DocumentYdocsService {
  constructor(private readonly prisma: PrismaService) {}

  async loadDocumentYdocState(documentId: string): Promise<DocumentYdocRuntimeState | null> {
    const ydoc = await this.prisma.documentYdoc.findUnique({
      where: {
        documentId,
      },
      select: documentYdocSelect,
    })

    if (!ydoc) {
      return null
    }

    const updates = await this.prisma.documentYdocUpdate.findMany({
      where: {
        documentId,
        runtimeEpoch: ydoc.runtimeEpoch,
        seq: {
          gt: ydoc.checkpointUpdateSeq,
        },
      },
      orderBy: {
        seq: 'asc',
      },
      select: documentYdocUpdateSelect,
    })

    return {
      metadata: toDocumentYdocCheckpointMetadata(ydoc),
      checkpointState: ydoc.checkpointState,
      updates: updates.map(toDocumentYdocUpdateRecord),
    }
  }

  async persistDocumentYdocUpdate(
    input: PersistDocumentYdocUpdateRequest,
  ): Promise<PersistDocumentYdocUpdateResponse> {
    const duplicateUpdate = await this.prisma.documentYdocUpdate.findUnique({
      where: {
        documentId_runtimeEpoch_idempotencyKey: {
          documentId: input.documentId,
          runtimeEpoch: input.runtimeEpoch,
          idempotencyKey: input.idempotencyKey,
        },
      },
      select: {
        documentId: true,
        runtimeEpoch: true,
        seq: true,
      },
    })

    if (duplicateUpdate) {
      return {
        documentId: duplicateUpdate.documentId,
        runtimeEpoch: duplicateUpdate.runtimeEpoch,
        seq: duplicateUpdate.seq,
        duplicate: true,
      }
    }

    return await this.prisma.$transaction(async (tx) => {
      const ydoc = await this.loadOrCreateDocumentYdoc(tx, input)

      this.assertRuntimeEpoch(ydoc.runtimeEpoch, input.runtimeEpoch)
      this.assertUpdateSeq({
        inputSeq: input.seq,
        checkpointUpdateSeq: ydoc.checkpointUpdateSeq,
        updateSeq: ydoc.updateSeq,
      })

      const update = await tx.documentYdocUpdate.create({
        data: {
          documentId: input.documentId,
          runtimeEpoch: input.runtimeEpoch,
          seq: input.seq,
          idempotencyKey: input.idempotencyKey,
          clientId: input.clientId,
          update: toPrismaBytes(input.update),
          createdBy: input.createdBy,
        },
        select: documentYdocUpdateSelect,
      })

      await tx.documentYdoc.update({
        where: {
          documentId: input.documentId,
        },
        data: {
          updateSeq: input.seq,
        },
      })

      return {
        documentId: update.documentId,
        runtimeEpoch: update.runtimeEpoch,
        seq: update.seq,
        duplicate: false,
      }
    })
  }

  async replaceDocumentYdocCheckpoint(
    input: ReplaceDocumentYdocCheckpointInput,
  ): Promise<DocumentYdocCheckpointMetadata> {
    return await this.prisma.$transaction(async (tx) => {
      const ydoc = await tx.documentYdoc.findUnique({
        where: {
          documentId: input.documentId,
        },
        select: documentYdocSelect,
      })

      if (!ydoc) {
        throw new NotFoundException(`DocumentYdoc "${input.documentId}" not found`)
      }

      this.assertRuntimeEpoch(ydoc.runtimeEpoch, input.runtimeEpoch)

      if (input.checkpointUpdateSeq > ydoc.updateSeq) {
        throw new ConflictException('checkpoint 水位不能超过已持久化 update 水位')
      }

      if (input.checkpointUpdateSeq <= ydoc.checkpointUpdateSeq) {
        return toDocumentYdocCheckpointMetadata(ydoc)
      }

      const nextYdoc = await tx.documentYdoc.update({
        where: {
          documentId: input.documentId,
        },
        data: {
          checkpointState: toPrismaBytes(input.checkpointState),
          checkpointSeq: {
            increment: 1,
          },
          checkpointUpdateSeq: input.checkpointUpdateSeq,
          lastProjectedProjectionId: input.lastProjectedProjectionId,
          lastProjectedProjectionRevision: input.lastProjectedProjectionRevision,
        },
        select: documentYdocSelect,
      })

      await tx.documentYdocUpdate.updateMany({
        where: {
          documentId: input.documentId,
          runtimeEpoch: input.runtimeEpoch,
          seq: {
            lte: input.checkpointUpdateSeq,
          },
        },
        data: {
          deletedAt: new Date(),
        },
      })

      return toDocumentYdocCheckpointMetadata(nextYdoc)
    })
  }

  async resetDocumentYdocRuntimeFromVersionSnapshot(
    tx: Prisma.TransactionClient,
    input: ResetDocumentYdocRuntimeFromVersionSnapshotInput,
  ): Promise<DocumentYdocCheckpointMetadata> {
    const checkpointState = createTiptapDocumentCollaborationCheckpointState({
      title: input.title,
      body: input.body,
    })
    const now = new Date()
    const existingYdoc = await tx.documentYdoc.findUnique({
      where: {
        documentId: input.documentId,
      },
      select: documentYdocSelect,
    })

    await tx.documentYdocUpdate.updateMany({
      where: {
        documentId: input.documentId,
        deletedAt: null,
      },
      data: {
        deletedAt: now,
      },
    })

    if (existingYdoc) {
      const nextYdoc = await tx.documentYdoc.update({
        where: {
          documentId: input.documentId,
        },
        data: {
          runtimeEpoch: {
            increment: 1,
          },
          checkpointState: toPrismaBytes(checkpointState),
          checkpointSeq: {
            increment: 1,
          },
          checkpointUpdateSeq: 0,
          updateSeq: 0,
          lastProjectedProjectionId: null,
          lastProjectedProjectionRevision: 0,
          lastProjectedAt: now,
          deletedAt: null,
        },
        select: documentYdocSelect,
      })

      return toDocumentYdocCheckpointMetadata(nextYdoc)
    }

    const nextYdoc = await tx.documentYdoc.create({
      data: {
        documentId: input.documentId,
        checkpointState: toPrismaBytes(checkpointState),
        checkpointSeq: 1,
        checkpointUpdateSeq: 0,
        updateSeq: 0,
        lastProjectedProjectionId: null,
        lastProjectedProjectionRevision: 0,
        lastProjectedAt: now,
      },
      select: documentYdocSelect,
    })

    return toDocumentYdocCheckpointMetadata(nextYdoc)
  }

  async resetDocumentYdocRuntimeWithTitle(
    tx: Prisma.TransactionClient,
    input: ResetDocumentYdocRuntimeWithTitleInput,
  ): Promise<ResetDocumentYdocRuntimeWithTitleResult> {
    const now = new Date()
    const existingYdoc = await tx.documentYdoc.findUnique({
      where: {
        documentId: input.documentId,
      },
      select: documentYdocSelect,
    })
    let updates: Uint8Array[] = []

    if (existingYdoc) {
      const persistedUpdates = await tx.documentYdocUpdate.findMany({
        where: {
          documentId: input.documentId,
          runtimeEpoch: existingYdoc.runtimeEpoch,
          seq: {
            gt: existingYdoc.checkpointUpdateSeq,
          },
          deletedAt: null,
        },
        orderBy: {
          seq: 'asc',
        },
        select: documentYdocUpdateSelect,
      })
      updates = persistedUpdates.map(update => update.update)
    }

    const { checkpointState, projection } = createTiptapDocumentCollaborationTitlePatchCheckpoint({
      checkpointState: existingYdoc?.checkpointState ?? null,
      updates,
      title: input.title,
      bodyWhenYdocMissing: input.bodyWhenYdocMissing,
    })

    await tx.documentYdocUpdate.updateMany({
      where: {
        documentId: input.documentId,
        deletedAt: null,
      },
      data: {
        deletedAt: now,
      },
    })

    if (existingYdoc) {
      const nextYdoc = await tx.documentYdoc.update({
        where: {
          documentId: input.documentId,
        },
        data: {
          runtimeEpoch: {
            increment: 1,
          },
          checkpointState: toPrismaBytes(checkpointState),
          checkpointSeq: {
            increment: 1,
          },
          checkpointUpdateSeq: 0,
          updateSeq: 0,
          lastProjectedProjectionId: null,
          lastProjectedProjectionRevision: 0,
          lastProjectedAt: now,
          deletedAt: null,
        },
        select: documentYdocSelect,
      })

      return {
        metadata: toDocumentYdocCheckpointMetadata(nextYdoc),
        projection,
      }
    }

    const nextYdoc = await tx.documentYdoc.create({
      data: {
        documentId: input.documentId,
        checkpointState: toPrismaBytes(checkpointState),
        checkpointSeq: 1,
        checkpointUpdateSeq: 0,
        updateSeq: 0,
        lastProjectedProjectionId: null,
        lastProjectedProjectionRevision: 0,
        lastProjectedAt: now,
      },
      select: documentYdocSelect,
    })

    return {
      metadata: toDocumentYdocCheckpointMetadata(nextYdoc),
      projection,
    }
  }

  async recordDocumentYdocCurrentProjection(
    tx: Prisma.TransactionClient,
    input: RecordDocumentYdocCurrentProjectionInput,
  ): Promise<DocumentYdocCheckpointMetadata> {
    const ydoc = await tx.documentYdoc.findUnique({
      where: {
        documentId: input.documentId,
      },
      select: documentYdocSelect,
    })

    if (!ydoc) {
      throw new NotFoundException(`DocumentYdoc "${input.documentId}" not found`)
    }

    this.assertRuntimeEpoch(ydoc.runtimeEpoch, input.runtimeEpoch)

    if (input.checkpointSeq > ydoc.checkpointSeq) {
      throw new ConflictException('当前读模型投影 checkpoint 不能超过已持久化 checkpoint')
    }

    if (input.checkpointUpdateSeq > ydoc.updateSeq) {
      throw new ConflictException('当前读模型投影水位不能超过已持久化 update 水位')
    }

    const nextYdoc = await tx.documentYdoc.update({
      where: {
        documentId: input.documentId,
      },
      data: {
        lastProjectedProjectionId: input.lastProjectedProjectionId,
        lastProjectedProjectionRevision: input.lastProjectedProjectionRevision,
        lastProjectedAt: new Date(),
      },
      select: documentYdocSelect,
    })

    return toDocumentYdocCheckpointMetadata(nextYdoc)
  }

  private async loadOrCreateDocumentYdoc(
    tx: Prisma.TransactionClient,
    input: PersistDocumentYdocUpdateRequest,
  ): Promise<PersistedDocumentYdoc> {
    const ydoc = await tx.documentYdoc.findUnique({
      where: {
        documentId: input.documentId,
      },
      select: documentYdocSelect,
    })

    if (ydoc) {
      return ydoc
    }

    if (input.seq !== 1) {
      throw new ConflictException('协作 update 序号不连续，请重新同步')
    }

    return await tx.documentYdoc.create({
      data: {
        documentId: input.documentId,
        runtimeEpoch: input.runtimeEpoch,
        updateSeq: 0,
      },
      select: documentYdocSelect,
    })
  }

  private assertRuntimeEpoch(currentEpoch: number, inputEpoch: number): void {
    if (resolveYdocRuntimeEpochError({ currentEpoch, inputEpoch })) {
      throw new ConflictException('协作运行时已失效，请重新连接')
    }
  }

  private assertUpdateSeq(input: {
    inputSeq: number
    checkpointUpdateSeq: number
    updateSeq: number
  }): void {
    const error = resolveYdocUpdateSequenceError(input)

    if (!error) {
      return
    }

    if (error === COLLAB_ERROR_CODE.UPDATE_CHECKPOINTED) {
      throw new ConflictException('协作 update 已被 checkpoint 覆盖，请重新同步')
    }

    if (error === COLLAB_ERROR_CODE.UPDATE_SEQUENCE_GAP) {
      throw new ConflictException('协作 update 序号不连续，请重新同步')
    }
  }
}

function toPrismaBytes(payload: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(payload)
}
