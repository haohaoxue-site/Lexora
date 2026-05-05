import type {
  DocumentYdocCheckpointMetadata,
  DocumentYdocUpdateRecord,
} from '@haohaoxue/samepage-contracts'

export function toDocumentYdocCheckpointMetadata(input: {
  documentId: string
  ydocFormatVersion: number
  runtimeEpoch: number
  checkpointSeq: number
  checkpointUpdateSeq: number
  updateSeq: number
  lastProjectedProjectionId: string | null
  lastProjectedProjectionRevision: number
  lastProjectedAt: Date | string | null
  updatedAt: Date | string
}): DocumentYdocCheckpointMetadata {
  return {
    documentId: input.documentId,
    ydocFormatVersion: input.ydocFormatVersion,
    runtimeEpoch: input.runtimeEpoch,
    checkpointSeq: input.checkpointSeq,
    checkpointUpdateSeq: input.checkpointUpdateSeq,
    updateSeq: input.updateSeq,
    lastProjectedProjectionId: input.lastProjectedProjectionId,
    lastProjectedProjectionRevision: input.lastProjectedProjectionRevision,
    lastProjectedAt: input.lastProjectedAt ? toIsoDateTime(input.lastProjectedAt) : null,
    updatedAt: toIsoDateTime(input.updatedAt),
  }
}

export function toDocumentYdocUpdateRecord(input: {
  id: string
  documentId: string
  runtimeEpoch: number
  seq: number
  idempotencyKey: string
  clientId: string | null
  update: Uint8Array<ArrayBuffer>
  createdBy: string | null
  createdAt: Date | string
}): DocumentYdocUpdateRecord {
  return {
    id: input.id,
    documentId: input.documentId,
    runtimeEpoch: input.runtimeEpoch,
    seq: input.seq,
    idempotencyKey: input.idempotencyKey,
    clientId: input.clientId,
    update: input.update,
    createdBy: input.createdBy,
    createdAt: toIsoDateTime(input.createdAt),
  }
}

function toIsoDateTime(value: Date | string): string {
  return typeof value === 'string' ? value : value.toISOString()
}
