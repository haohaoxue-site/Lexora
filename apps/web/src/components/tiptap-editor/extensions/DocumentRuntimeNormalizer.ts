import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { Extension } from '@tiptap/core'
import { isChangeOrigin } from '@tiptap/extension-collaboration'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Mapping } from '@tiptap/pm/transform'
import {
  BODY_BLOCK_ID_ATTRIBUTE,
  isBlockId,
} from '../content/blockId'

export const DOCUMENT_RUNTIME_NORMALIZER_TRANSACTION_META = 'lexoraDocumentRuntimeNormalize'

// 只修复协作运行时产生的顶层无 blockId 合成空段，不作为通用内容整理器使用。
export const DocumentRuntimeNormalizer = Extension.create({
  name: 'DocumentRuntimeNormalizer',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey(this.name),
        appendTransaction: (transactions, _, newState) => {
          const changedTransactions = transactions.filter(transaction =>
            transaction.docChanged && !transaction.getMeta(DOCUMENT_RUNTIME_NORMALIZER_TRANSACTION_META),
          )

          if (changedTransactions.length === 0 || !changedTransactions.every(isChangeOrigin)) {
            return
          }

          return createSyntheticEmptyParagraphCleanupTransaction(
            newState,
            collectChangedRanges(changedTransactions),
          ) ?? undefined
        },
      }),
    ]
  },

  onCreate() {
    const transaction = createSyntheticEmptyParagraphCleanupTransaction(this.editor.state)

    if (!transaction) {
      return
    }

    this.editor.view.dispatch(transaction)
  },
})

function createSyntheticEmptyParagraphCleanupTransaction(
  state: EditorState,
  changedRanges: ReadonlyArray<ChangedRange> | null = null,
): Transaction | null {
  const { doc } = state

  if (doc.childCount <= 1) {
    return null
  }

  let hasStableBlockId = false

  for (let index = 0; index < doc.childCount; index += 1) {
    if (readBlockId(doc.child(index))) {
      hasStableBlockId = true
      break
    }
  }

  if (!hasStableBlockId) {
    return null
  }

  let transaction = state.tr
  let changed = false
  let position = 0

  for (let index = 0; index < doc.childCount; index += 1) {
    const node = doc.child(index)
    const nodeSize = node.nodeSize

    if (shouldRemoveSyntheticParagraph(node, position, changedRanges)) {
      transaction = transaction.delete(position, position + nodeSize)
      changed = true
      continue
    }

    position += nodeSize
  }

  if (!changed) {
    return null
  }

  return transaction
    .setMeta(DOCUMENT_RUNTIME_NORMALIZER_TRANSACTION_META, true)
    .setMeta('addToHistory', false)
}

interface ChangedRange {
  from: number
  to: number
}

function collectChangedRanges(transactions: readonly Transaction[]): ChangedRange[] {
  const mapping = new Mapping()

  transactions.forEach((transaction) => {
    transaction.mapping.maps.forEach(map => mapping.appendMap(map))
  })

  const ranges: ChangedRange[] = []

  mapping.maps.forEach((map, mapIndex) => {
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      const remainingMapping = mapping.slice(mapIndex + 1)

      ranges.push({
        from: remainingMapping.map(newStart, -1),
        to: remainingMapping.map(newEnd, 1),
      })
    })
  })

  return ranges
}

function shouldRemoveSyntheticParagraph(
  node: ProseMirrorNode,
  position: number,
  changedRanges: ReadonlyArray<ChangedRange> | null,
) {
  return node.type.name === 'paragraph'
    && node.textContent.length === 0
    && !readBlockId(node)
    && isTouchedByChangedRanges(position, node.nodeSize, changedRanges)
}

function isTouchedByChangedRanges(
  position: number,
  nodeSize: number,
  changedRanges: ReadonlyArray<ChangedRange> | null,
) {
  if (!changedRanges) {
    return true
  }

  const to = position + nodeSize

  return changedRanges.some(range => range.from <= to && range.to >= position)
}

function readBlockId(node: ProseMirrorNode) {
  const blockId = node.attrs[BODY_BLOCK_ID_ATTRIBUTE]

  if (!isBlockId(blockId)) {
    return null
  }

  return blockId
}
