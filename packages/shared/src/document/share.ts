import type {
  DocumentShareMode,
  DocumentShareModeIconName,
  DocumentShareProjection,
  DocumentShareProjectionPolicySource,
  DocumentShareProjectionTreeNode,
} from '@haohaoxue/samepage-contracts'
import {
  DOCUMENT_SHARE_MODE,
  DOCUMENT_SHARE_MODE_ICON_NAMES,
  DOCUMENT_SHARE_MODE_LABELS,
  DOCUMENT_SHARE_ROUTE_PREFIX,
} from '@haohaoxue/samepage-contracts'

export function buildSharedDocumentPath(shareId: string): string {
  return `${DOCUMENT_SHARE_ROUTE_PREFIX}/${shareId}`
}

export function buildSharedDocumentRecipientPath(recipientId: string): string {
  return `${DOCUMENT_SHARE_ROUTE_PREFIX}/recipients/${recipientId}`
}

export function getDocumentShareModeLabel(mode: DocumentShareMode | null | undefined): string {
  return DOCUMENT_SHARE_MODE_LABELS[normalizeDocumentShareMode(mode)]
}

export function getDocumentShareModeIconName(
  mode: DocumentShareMode | null | undefined,
): DocumentShareModeIconName {
  return DOCUMENT_SHARE_MODE_ICON_NAMES[normalizeDocumentShareMode(mode)]
}

export function getDocumentShareProjectionMode(
  share: DocumentShareProjection | null | undefined,
): DocumentShareMode {
  return share?.effectivePolicy?.mode ?? DOCUMENT_SHARE_MODE.NONE
}

export function getDocumentShareProjectionModeLabel(
  share: DocumentShareProjection | null | undefined,
): string {
  return getDocumentShareModeLabel(getDocumentShareProjectionMode(share))
}

export function getDocumentShareProjectionIconName(
  share: DocumentShareProjection | null | undefined,
): DocumentShareModeIconName {
  return getDocumentShareModeIconName(getDocumentShareProjectionMode(share))
}

export function buildDocumentShareProjectionMap(input: {
  documents: DocumentShareProjectionTreeNode[]
  shares: DocumentShareProjectionPolicySource[]
}): Map<string, DocumentShareProjection> {
  if (input.documents.length === 0 || input.shares.length === 0) {
    return new Map()
  }

  const documentsById = new Map(input.documents.map(document => [document.id, document]))
  const shareByDocumentId = new Map(input.shares.map(share => [share.documentId, share]))
  const projectionByDocumentId = new Map<string, DocumentShareProjection>()

  for (const document of input.documents) {
    const localShare = shareByDocumentId.get(document.id) ?? null
    const rootDocument = resolveProjectionRootDocument(document, documentsById, shareByDocumentId)

    if (!rootDocument) {
      continue
    }

    const effectiveShare = shareByDocumentId.get(rootDocument.id)

    if (!effectiveShare) {
      continue
    }

    projectionByDocumentId.set(document.id, {
      localPolicy: localShare
        ? toLocalPolicy(localShare)
        : null,
      effectivePolicy: toEffectivePolicy(rootDocument, effectiveShare),
    })
  }

  return projectionByDocumentId
}

export function buildRootDocumentShareProjection(
  rootDocument: Pick<DocumentShareProjectionTreeNode, 'id' | 'title'>,
  share: DocumentShareProjectionPolicySource | null | undefined,
): DocumentShareProjection | null {
  if (!share) {
    return null
  }

  return {
    localPolicy: toLocalPolicy(share),
    effectivePolicy: toEffectivePolicy(rootDocument, share),
  }
}

function normalizeDocumentShareMode(mode: DocumentShareMode | null | undefined): DocumentShareMode {
  return mode ?? DOCUMENT_SHARE_MODE.NONE
}

function resolveProjectionRootDocument(
  document: DocumentShareProjectionTreeNode,
  documentsById: ReadonlyMap<string, DocumentShareProjectionTreeNode>,
  shareByDocumentId: ReadonlyMap<string, DocumentShareProjectionPolicySource>,
): DocumentShareProjectionTreeNode | null {
  let currentDocument: DocumentShareProjectionTreeNode | undefined = document

  while (currentDocument) {
    if (shareByDocumentId.has(currentDocument.id)) {
      return currentDocument
    }

    currentDocument = currentDocument.parentId
      ? documentsById.get(currentDocument.parentId)
      : undefined
  }

  return null
}

function toLocalPolicy(
  share: DocumentShareProjectionPolicySource,
): NonNullable<DocumentShareProjection['localPolicy']> {
  return {
    mode: share.mode,
    shareId: share.id,
    directUserCount: share.directUserCount,
    updatedAt: share.updatedAt.toISOString(),
    updatedBy: share.updatedBy,
  }
}

function toEffectivePolicy(
  rootDocument: Pick<DocumentShareProjectionTreeNode, 'id' | 'title'>,
  share: DocumentShareProjectionPolicySource,
): NonNullable<DocumentShareProjection['effectivePolicy']> {
  return {
    mode: share.mode,
    shareId: share.id,
    rootDocumentId: rootDocument.id,
    rootDocumentTitle: rootDocument.title,
    updatedAt: share.updatedAt.toISOString(),
    updatedBy: share.updatedBy,
  }
}
