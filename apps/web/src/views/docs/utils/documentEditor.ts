import type { DocumentVersionSnapshot } from '@haohaoxue/samepage-contracts'
import type {
  ActiveDocumentDetail,
} from '../typing'

export function buildHistoryPreviewDocument(options: {
  document: ActiveDocumentDetail | null
  snapshot: DocumentVersionSnapshot | null
}) {
  if (!options.document) {
    return null
  }

  if (!options.snapshot) {
    return options.document
  }

  return {
    ...options.document,
    latestVersionSnapshotId: options.snapshot.id,
    schemaVersion: options.snapshot.schemaVersion,
    updatedAt: options.snapshot.createdAt,
    title: options.snapshot.title,
    body: options.snapshot.body,
  } satisfies ActiveDocumentDetail
}

export function resolveDefaultHistorySnapshotId(options: {
  document: ActiveDocumentDetail | null
  snapshots: DocumentVersionSnapshot[]
  currentSelectedSnapshotId: string | null
}) {
  if (options.snapshots.some(snapshot => snapshot.id === options.currentSelectedSnapshotId)) {
    return options.currentSelectedSnapshotId
  }

  return options.document?.latestVersionSnapshotId
    ?? options.snapshots[0]?.id
    ?? null
}
