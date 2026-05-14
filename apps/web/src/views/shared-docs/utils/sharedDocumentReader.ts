import type { SharedDocumentReaderDocument } from '../typing'
import type { DocumentCurrent } from '@/apis/document-share'
import { TIPTAP_SCHEMA_VERSION } from '@haohaoxue/samepage-contracts'

const UNSUPPORTED_SHARED_DOCUMENT_SCHEMA_ERROR_CODE = 'SHARED_DOCUMENT_UNSUPPORTED_SCHEMA_VERSION'

type UnsupportedSharedDocumentSchemaError = Error & {
  code: typeof UNSUPPORTED_SHARED_DOCUMENT_SCHEMA_ERROR_CODE
  schemaVersion: unknown
}

export function toSharedDocumentReaderDocument(documentCurrent: DocumentCurrent): SharedDocumentReaderDocument {
  assertSharedDocumentReaderSchemaVersion(documentCurrent.currentProjection.schemaVersion)

  return {
    id: documentCurrent.document.id,
    title: documentCurrent.currentProjection.title,
    body: documentCurrent.currentProjection.body,
    pageWidthMode: documentCurrent.document.pageWidthMode,
  }
}

export function isUnsupportedSharedDocumentSchemaError(
  error: unknown,
): error is UnsupportedSharedDocumentSchemaError {
  return error instanceof Error
    && (error as Partial<UnsupportedSharedDocumentSchemaError>).code === UNSUPPORTED_SHARED_DOCUMENT_SCHEMA_ERROR_CODE
}

function assertSharedDocumentReaderSchemaVersion(
  schemaVersion: unknown,
): asserts schemaVersion is typeof TIPTAP_SCHEMA_VERSION {
  if (schemaVersion === TIPTAP_SCHEMA_VERSION) {
    return
  }

  const error = new Error(
    `Unsupported shared document schema version: ${String(schemaVersion)}`,
  ) as UnsupportedSharedDocumentSchemaError
  error.code = UNSUPPORTED_SHARED_DOCUMENT_SCHEMA_ERROR_CODE
  error.schemaVersion = schemaVersion
  throw error
}
