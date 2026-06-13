import type { DocumentYdocRuntimeState } from '@haohaoxue/lexora-contracts'
import type { DocumentYdocRuntimeStore } from './ydoc-runtime-store'
import * as Y from 'yjs'

/** 从 runtime store 恢复出的 Y.Doc 与元信息。 */
export interface LoadedDocumentYdoc {
  document: Y.Doc
  runtimeState: DocumentYdocRuntimeState | null
}

export async function restoreDocumentYdocFromRuntimeStore(
  documentId: string,
  ydocRuntimeStore: DocumentYdocRuntimeStore,
): Promise<Y.Doc> {
  return (await loadDocumentYdocFromRuntimeStore(documentId, ydocRuntimeStore)).document
}

export async function loadDocumentYdocFromRuntimeStore(
  documentId: string,
  ydocRuntimeStore: DocumentYdocRuntimeStore,
): Promise<LoadedDocumentYdoc> {
  const doc = new Y.Doc()
  const state = await ydocRuntimeStore.loadDocumentYdocState(documentId)
    ?? await ydocRuntimeStore.bootstrapDocumentYdocState(documentId)

  if (!state) {
    return {
      document: doc,
      runtimeState: null,
    }
  }

  if (state.checkpointState) {
    Y.applyUpdate(doc, state.checkpointState)
  }

  for (const update of state.updates) {
    Y.applyUpdate(doc, update.update)
  }

  return {
    document: doc,
    runtimeState: state,
  }
}
