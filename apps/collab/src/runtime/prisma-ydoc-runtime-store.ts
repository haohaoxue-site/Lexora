import type {
  DocumentYdocRuntimeState,
  PersistDocumentYdocUpdateRequest,
} from '@haohaoxue/samepage-contracts'
import type { Prisma } from '@prisma/client'
import type { DocumentYdocRuntimeStore } from './ydoc-runtime-store'
import { COLLAB_ERROR_CODE } from '@haohaoxue/samepage-contracts'
import {
  createTiptapDocumentCollaborationYdoc,
  isYdocRuntimeInitialized,
  resolveYdocRuntimeEpochError,
  resolveYdocUpdateSequenceError,
  toDocumentYdocCheckpointMetadata,
  toDocumentYdocUpdateRecord,
} from '@haohaoxue/samepage-shared'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import * as Y from 'yjs'

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

type YdocRuntimePrismaClient = Pick<PrismaClient, 'document' | 'documentYdoc' | 'documentYdocUpdate'>

/** Prisma DocumentYdoc runtime 持久化输入。 */
export interface CreatePrismaDocumentYdocRuntimeStoreInput {
  databaseUrl: string
  prisma?: PrismaClient
}

export function createPrismaDocumentYdocRuntimeStore(
  input: CreatePrismaDocumentYdocRuntimeStoreInput,
): DocumentYdocRuntimeStore {
  const prisma = input.prisma ?? new PrismaClient({
    adapter: new PrismaPg({
      connectionString: input.databaseUrl,
    }),
  })

  return {
    async loadDocumentRuntimeEpoch(documentId) {
      const ydoc = await prisma.documentYdoc.findFirst({
        where: {
          documentId,
          deletedAt: null,
        },
        select: {
          runtimeEpoch: true,
        },
      })

      return ydoc?.runtimeEpoch ?? null
    },

    async loadDocumentYdocState(documentId) {
      return await loadDocumentYdocStateFromClient(prisma, documentId)
    },

    async bootstrapDocumentYdocState(documentId) {
      return await prisma.$transaction(async (tx) => {
        const document = await tx.document.findUnique({
          where: {
            id: documentId,
          },
          select: {
            id: true,
          },
        })

        if (!document) {
          return null
        }

        const ydoc = await tx.documentYdoc.upsert({
          where: {
            documentId,
          },
          create: {
            documentId,
          },
          update: {},
          select: documentYdocSelect,
        })

        if (isYdocRuntimeInitialized(ydoc)) {
          return await loadDocumentYdocStateFromClient(tx, documentId)
        }

        const checkpointState = Y.encodeStateAsUpdate(createTiptapDocumentCollaborationYdoc({
          title: [],
          body: [],
        }))

        const bootstrapResult = await tx.documentYdoc.updateMany({
          where: {
            documentId,
            runtimeEpoch: ydoc.runtimeEpoch,
            deletedAt: null,
            checkpointState: null,
            checkpointSeq: 0,
            checkpointUpdateSeq: 0,
            updateSeq: 0,
          },
          data: {
            checkpointState: toPrismaBytes(checkpointState),
            lastProjectedProjectionId: null,
            lastProjectedProjectionRevision: 0,
            lastProjectedAt: null,
          },
        })

        if (bootstrapResult.count === 0) {
          return await loadDocumentYdocStateFromClient(tx, documentId)
        }

        return await loadDocumentYdocStateFromClient(tx, documentId)
      })
    },

    async persistDocumentYdocUpdate(input) {
      const duplicateUpdate = await prisma.documentYdocUpdate.findUnique({
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

      return await prisma.$transaction(async (tx) => {
        const ydoc = await loadOrCreateDocumentYdoc(tx, input)

        assertRuntimeEpoch(ydoc.runtimeEpoch, input.runtimeEpoch)
        assertUpdateSeq({
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
    },

    async replaceDocumentYdocCheckpoint(input) {
      return await prisma.$transaction(async (tx) => {
        const ydoc = await tx.documentYdoc.findUnique({
          where: {
            documentId: input.documentId,
          },
          select: documentYdocSelect,
        })

        if (!ydoc) {
          throw new Error(`DocumentYdoc "${input.documentId}" not found`)
        }

        assertRuntimeEpoch(ydoc.runtimeEpoch, input.runtimeEpoch)

        if (input.checkpointUpdateSeq > ydoc.updateSeq) {
          throw new Error('checkpoint 水位不能超过已持久化 update 水位')
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
    },

    async close() {
      await prisma.$disconnect()
    },
  }
}

async function loadDocumentYdocStateFromClient(
  prisma: YdocRuntimePrismaClient,
  documentId: string,
): Promise<DocumentYdocRuntimeState | null> {
  const ydoc = await prisma.documentYdoc.findUnique({
    where: {
      documentId,
    },
    select: documentYdocSelect,
  })

  if (!ydoc) {
    return null
  }

  const updates = await prisma.documentYdocUpdate.findMany({
    where: {
      documentId,
      runtimeEpoch: ydoc.runtimeEpoch,
      deletedAt: null,
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

async function loadOrCreateDocumentYdoc(
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
    throw new Error('协作 update 序号不连续，请重新同步')
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

function assertRuntimeEpoch(currentEpoch: number, inputEpoch: number): void {
  if (resolveYdocRuntimeEpochError({ currentEpoch, inputEpoch })) {
    throw new Error('协作运行时已失效，请重新连接')
  }
}

function assertUpdateSeq(input: {
  inputSeq: number
  checkpointUpdateSeq: number
  updateSeq: number
}): void {
  const error = resolveYdocUpdateSequenceError(input)

  if (!error) {
    return
  }

  if (error === COLLAB_ERROR_CODE.UPDATE_CHECKPOINTED) {
    throw new Error('协作 update 已被 checkpoint 覆盖，请重新同步')
  }

  if (error === COLLAB_ERROR_CODE.UPDATE_SEQUENCE_GAP) {
    throw new Error('协作 update 序号不连续，请重新同步')
  }
}

function toPrismaBytes(payload: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(payload)
}
