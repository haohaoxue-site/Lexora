import type { TiptapJsonContent } from '@haohaoxue/samepage-contracts'
import { serializeTiptapJsonContentToMarkdownLike } from '@haohaoxue/samepage-shared'

export interface DocsSelectionMarkdownSnapshot {
  snapshot: string
  size: number
}

export function createDocsSelectionMarkdownSnapshot(content: TiptapJsonContent): DocsSelectionMarkdownSnapshot {
  const snapshot = serializeDocsSelectionSnapshotToMarkdownLike(content)

  return {
    snapshot,
    size: snapshot.length,
  }
}

export function serializeDocsSelectionSnapshotToMarkdownLike(content: TiptapJsonContent): string {
  return serializeTiptapJsonContentToMarkdownLike(content)
}
