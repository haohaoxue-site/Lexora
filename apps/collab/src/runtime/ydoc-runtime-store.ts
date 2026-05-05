import type {
  DocumentYdocCheckpointMetadata,
  DocumentYdocRuntimeState,
  PersistDocumentYdocUpdateRequest,
  PersistDocumentYdocUpdateResponse,
} from '@haohaoxue/samepage-contracts'

/** DocumentYdoc runtime 持久化。 */
export interface DocumentYdocRuntimeStore {
  loadDocumentYdocState: (documentId: string) => Promise<DocumentYdocRuntimeState | null>
  loadDocumentRuntimeEpoch: (documentId: string) => Promise<number | null>
  bootstrapDocumentYdocState: (documentId: string) => Promise<DocumentYdocRuntimeState | null>
  persistDocumentYdocUpdate: (input: PersistDocumentYdocUpdateRequest) => Promise<PersistDocumentYdocUpdateResponse>
  replaceDocumentYdocCheckpoint: (input: {
    documentId: string
    runtimeEpoch: number
    checkpointState: Uint8Array
    checkpointUpdateSeq: number
    lastProjectedProjectionId: string | null
    lastProjectedProjectionRevision: number
  }) => Promise<DocumentYdocCheckpointMetadata>
  close?: () => Promise<void>
}

export function createEmptyDocumentYdocRuntimeStore(): DocumentYdocRuntimeStore {
  return {
    async loadDocumentRuntimeEpoch() {
      return null
    },

    async loadDocumentYdocState() {
      return null
    },

    async bootstrapDocumentYdocState() {
      return null
    },

    async persistDocumentYdocUpdate(input) {
      return {
        documentId: input.documentId,
        runtimeEpoch: input.runtimeEpoch,
        seq: input.seq,
        duplicate: false,
      }
    },

    async replaceDocumentYdocCheckpoint(input) {
      return {
        documentId: input.documentId,
        ydocFormatVersion: 1,
        runtimeEpoch: input.runtimeEpoch,
        checkpointSeq: 0,
        checkpointUpdateSeq: input.checkpointUpdateSeq,
        updateSeq: input.checkpointUpdateSeq,
        lastProjectedProjectionId: input.lastProjectedProjectionId,
        lastProjectedProjectionRevision: input.lastProjectedProjectionRevision,
        lastProjectedAt: null,
        updatedAt: new Date().toISOString(),
      }
    },
  }
}
