import type { TiptapJsonContent } from '@haohaoxue/lexora-contracts'
import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import type { ChatComposerDocumentSelectionScope } from '@/components/chat-composer'
import {
  BODY_BLOCK_ID_ATTRIBUTE,
  isAddressableBodyBlock,
} from '@/components/tiptap-editor/content/blockId'
import { createDocsSelectionMarkdownSnapshot } from './docsSelectionSnapshotSerializer'

const UNSUPPORTED_SELECTION_BLOCK_TYPES = new Set([
  'table',
  'image',
  'file',
  'horizontalRule',
  'blockMath',
])

export interface DocsSelectionLiveRange {
  from: number
  to: number
}

export interface DocsSelectionSnapshot {
  scope: ChatComposerDocumentSelectionScope
  snapshot: string
  size: number
}

export function resolveDocsSelectionScope(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): ChatComposerDocumentSelectionScope | null {
  const range = normalizeDocsSelectionRange({ from, to })

  if (!range) {
    return null
  }

  const fromBoundary = resolveSelectionBoundary(doc, range.from)
  const toBoundary = resolveSelectionBoundary(doc, range.to)

  if (!fromBoundary || !toBoundary) {
    return null
  }

  const blockIds = collectSelectionBlockIds(doc, range)

  if (!blockIds.length) {
    return null
  }

  return {
    kind: 'selection',
    field: 'body',
    blockIds,
    from: fromBoundary,
    to: toBoundary,
  }
}

export function createDocsSelectionSnapshot(
  editor: Editor,
  range: DocsSelectionLiveRange,
): DocsSelectionSnapshot | null {
  const normalizedRange = normalizeDocsSelectionRange(range)

  if (!normalizedRange) {
    return null
  }

  const scope = resolveDocsSelectionScope(editor.state.doc, normalizedRange.from, normalizedRange.to)

  if (!scope) {
    return null
  }

  const content = selectionSliceToContent(editor.state.doc, normalizedRange)
  const snapshot = createDocsSelectionMarkdownSnapshot(content)

  return {
    scope,
    ...snapshot,
  }
}

export function mapDocsSelectionLiveRange(
  range: DocsSelectionLiveRange,
  transaction: Transaction,
): DocsSelectionLiveRange | null {
  if (!transaction.docChanged) {
    return range
  }

  const from = transaction.mapping.mapResult(range.from, -1)
  const to = transaction.mapping.mapResult(range.to, 1)

  if (from.deletedAcross || to.deletedAcross) {
    return null
  }

  return normalizeDocsSelectionRange({
    from: from.pos,
    to: to.pos,
  })
}

function collectSelectionBlockIds(
  doc: ProseMirrorNode,
  range: DocsSelectionLiveRange,
): string[] {
  const blockIds: string[] = []
  const seenBlockIds = new Set<string>()
  let invalid = false

  doc.nodesBetween(range.from, range.to, (node, _position, parent) => {
    if (!isAddressableBodyBlock(node, parent)) {
      return
    }

    if (isUnsupportedSelectionBlock(node)) {
      invalid = true
      return false
    }

    const blockId = readBlockId(node)

    if (!blockId) {
      invalid = true
      return false
    }

    if (!seenBlockIds.has(blockId)) {
      blockIds.push(blockId)
      seenBlockIds.add(blockId)
    }
  })

  return invalid ? [] : blockIds
}

function resolveSelectionBoundary(
  doc: ProseMirrorNode,
  position: number,
): ChatComposerDocumentSelectionScope['from'] | null {
  const resolvedPosition = doc.resolve(position)

  for (let depth = resolvedPosition.depth; depth > 0; depth -= 1) {
    const node = resolvedPosition.node(depth)
    const parent = resolvedPosition.node(depth - 1)

    if (!isAddressableBodyBlock(node, parent)) {
      continue
    }

    if (isUnsupportedSelectionBlock(node)) {
      return null
    }

    const blockId = readBlockId(node)

    if (!blockId) {
      return null
    }

    const blockStart = resolvedPosition.before(depth)
    const relativeOffset = Math.max(0, position - blockStart - 1)

    return {
      blockId,
      offset: node.textBetween(0, relativeOffset, '\n', '\n').length,
    }
  }

  return null
}

function selectionSliceToContent(
  doc: ProseMirrorNode,
  range: DocsSelectionLiveRange,
): TiptapJsonContent {
  const json = doc.cut(range.from, range.to).toJSON().content

  return Array.isArray(json) ? json as TiptapJsonContent : []
}

function normalizeDocsSelectionRange(range: DocsSelectionLiveRange): DocsSelectionLiveRange | null {
  const from = Math.min(range.from, range.to)
  const to = Math.max(range.from, range.to)

  if (from >= to) {
    return null
  }

  return {
    from,
    to,
  }
}

function readBlockId(node: ProseMirrorNode): string | null {
  const blockId = node.attrs[BODY_BLOCK_ID_ATTRIBUTE]

  return typeof blockId === 'string' && blockId.length ? blockId : null
}

function isUnsupportedSelectionBlock(node: ProseMirrorNode) {
  return UNSUPPORTED_SELECTION_BLOCK_TYPES.has(node.type.name)
}
