import type {
  DocumentYdocRuntimeState,
  PersistDocumentYdocUpdateRequest,
} from '@haohaoxue/samepage-contracts'
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
import { Prisma, PrismaClient } from '@prisma/client'
import * as Y from 'yjs'
import {
  DocumentYdocRuntimeStoreError,
  isDocumentYdocRuntimeStoreError,
} from './ydoc-runtime-store'

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

const RETRYABLE_PRISMA_ERROR_CODES = new Set([
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
  'P2034',
])

const RETRYABLE_NODE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
])

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
      const duplicateUpdate = await findDuplicateDocumentYdocUpdate(prisma, input)

      if (duplicateUpdate) {
        return {
          documentId: duplicateUpdate.documentId,
          runtimeEpoch: duplicateUpdate.runtimeEpoch,
          seq: duplicateUpdate.seq,
          duplicate: true,
        }
      }

      try {
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
      }
      catch (error) {
        if (isUniqueConstraintError(error, ['documentId', 'runtimeEpoch', 'idempotencyKey'])) {
          const duplicateUpdateAfterConflict = await findDuplicateDocumentYdocUpdate(prisma, input)

          if (duplicateUpdateAfterConflict) {
            return {
              documentId: duplicateUpdateAfterConflict.documentId,
              runtimeEpoch: duplicateUpdateAfterConflict.runtimeEpoch,
              seq: duplicateUpdateAfterConflict.seq,
              duplicate: true,
            }
          }
        }

        throw normalizeDocumentYdocRuntimeStoreError(error)
      }
    },

    async replaceDocumentYdocCheckpoint(input) {
      try {
        return await prisma.$transaction(async (tx) => {
          const ydoc = await tx.documentYdoc.findUnique({
            where: {
              documentId: input.documentId,
            },
            select: documentYdocSelect,
          })

          if (!ydoc) {
            throw new DocumentYdocRuntimeStoreError({
              code: COLLAB_ERROR_CODE.PERSISTENCE_FAILED,
              message: `DocumentYdoc "${input.documentId}" not found`,
              retryable: false,
            })
          }

          assertRuntimeEpoch(ydoc.runtimeEpoch, input.runtimeEpoch)

          if (input.checkpointUpdateSeq > ydoc.updateSeq) {
            throw new DocumentYdocRuntimeStoreError({
              code: COLLAB_ERROR_CODE.CHECKPOINT_EXPIRED,
              message: 'checkpoint 水位不能超过已持久化 update 水位',
              retryable: false,
            })
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
      catch (error) {
        throw normalizeDocumentYdocRuntimeStoreError(error)
      }
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
    throw new DocumentYdocRuntimeStoreError({
      code: COLLAB_ERROR_CODE.UPDATE_SEQUENCE_GAP,
      message: '协作 update 序号不连续，请重新同步',
      retryable: false,
    })
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
    throw new DocumentYdocRuntimeStoreError({
      code: COLLAB_ERROR_CODE.RUNTIME_EPOCH_EXPIRED,
      message: '协作运行时已失效，请重新连接',
      retryable: false,
    })
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
    throw new DocumentYdocRuntimeStoreError({
      code: COLLAB_ERROR_CODE.UPDATE_CHECKPOINTED,
      message: '协作 update 已被 checkpoint 覆盖，请重新同步',
      retryable: false,
    })
  }

  if (error === COLLAB_ERROR_CODE.UPDATE_SEQUENCE_GAP) {
    throw new DocumentYdocRuntimeStoreError({
      code: COLLAB_ERROR_CODE.UPDATE_SEQUENCE_GAP,
      message: '协作 update 序号不连续，请重新同步',
      retryable: false,
    })
  }
}

function toPrismaBytes(payload: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(payload)
}

async function findDuplicateDocumentYdocUpdate(
  prisma: YdocRuntimePrismaClient,
  input: PersistDocumentYdocUpdateRequest,
) {
  return await prisma.documentYdocUpdate.findUnique({
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
}

function normalizeDocumentYdocRuntimeStoreError(error: unknown): DocumentYdocRuntimeStoreError {
  if (isDocumentYdocRuntimeStoreError(error)) {
    return error
  }

  if (isUniqueConstraintError(error, ['documentId', 'runtimeEpoch', 'seq'])) {
    return new DocumentYdocRuntimeStoreError({
      code: COLLAB_ERROR_CODE.UPDATE_SEQUENCE_GAP,
      message: '协作 update 序号已被占用，请重新同步',
      retryable: false,
      cause: error,
    })
  }

  return new DocumentYdocRuntimeStoreError({
    code: COLLAB_ERROR_CODE.PERSISTENCE_FAILED,
    message: resolvePersistenceErrorMessage(error),
    retryable: isRetryablePersistenceError(error),
    cause: error,
  })
}

function isUniqueConstraintError(error: unknown, target: readonly string[]): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false
  }

  return isSamePrismaTarget(error.meta?.target, target)
}

function isSamePrismaTarget(actual: unknown, expected: readonly string[]): boolean {
  if (Array.isArray(actual)) {
    return expected.every(field => actual.includes(field))
  }

  if (typeof actual === 'string') {
    return expected.every(field => actual.includes(field))
  }

  return false
}

function isRetryablePersistenceError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return RETRYABLE_PRISMA_ERROR_CODES.has(error.code)
  }

  const code = readObjectString(error, 'code')
  return code ? RETRYABLE_NODE_ERROR_CODES.has(code) : true
}

function resolvePersistenceErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return '协作持久化失败'
}

function readObjectString(input: unknown, key: string): string | null {
  if (!input || typeof input !== 'object' || !(key in input)) {
    return null
  }

  const value = (input as Record<string, unknown>)[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}
