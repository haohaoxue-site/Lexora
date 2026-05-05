import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { BodyBlockIdNodeType } from '../content/blockId'
import { Extension } from '@tiptap/core'
import { isChangeOrigin } from '@tiptap/extension-collaboration'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import {
  BODY_BLOCK_ID_ATTRIBUTE,
  BODY_BLOCK_ID_NODE_TYPES,

  createBlockId,
  isBlockId,
} from '../content/blockId'

const BLOCK_ID_TRANSACTION_META = 'samepageBlockIdTransaction'

/**
 * blockId 扩展配置。
 */
export interface BlockIdOptions {
  attributeName: string
  dataAttributeName: string
  types: string[]
  generateId: (nodeType: BodyBlockIdNodeType) => string
}

export const BlockId = Extension.create<BlockIdOptions>({
  name: 'blockId',

  addOptions() {
    return {
      attributeName: BODY_BLOCK_ID_ATTRIBUTE,
      dataAttributeName: 'data-block-id',
      types: [...BODY_BLOCK_ID_NODE_TYPES],
      generateId: createBlockId,
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          [this.options.attributeName]: {
            default: null,
            parseHTML: element => element.getAttribute(this.options.dataAttributeName),
            renderHTML: (attributes) => {
              const blockId = attributes[this.options.attributeName]

              if (typeof blockId !== 'string' || !blockId.length) {
                return {}
              }

              return {
                id: blockId,
                [this.options.dataAttributeName]: blockId,
              }
            },
          },
        },
      },
    ]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey(this.name),
        appendTransaction: (transactions, _, newState) => {
          const changedTransactions = transactions.filter(transaction =>
            transaction.docChanged && !transaction.getMeta(BLOCK_ID_TRANSACTION_META),
          )

          if (changedTransactions.length === 0) {
            return
          }

          if (changedTransactions.every(isChangeOrigin)) {
            return createSyntheticEmptyParagraphCleanupTransaction(
              newState,
              this.options.attributeName,
            ) ?? undefined
          }

          return createBlockIdTransaction(newState, this.options) ?? undefined
        },
      }),
    ]
  },

  onCreate() {
    const transaction = createSyntheticEmptyParagraphCleanupTransaction(
      this.editor.state,
      this.options.attributeName,
    ) ?? createBlockIdTransaction(this.editor.state, this.options)

    if (!transaction) {
      return
    }

    this.editor.view.dispatch(transaction)
  },
})

function createBlockIdTransaction(
  state: EditorState,
  options: BlockIdOptions,
): Transaction | null {
  const seenIds = new Set<string>()
  let transaction = state.tr
  let changed = false

  state.doc.descendants((node, pos) => {
    if (!shouldAssignBlockId(node, options.types)) {
      return
    }

    const blockId = readBlockId(node, options.attributeName)

    if (blockId && !seenIds.has(blockId)) {
      seenIds.add(blockId)
      return
    }

    const nextId = generateUniqueBlockId(node.type.name, seenIds, options.generateId)

    seenIds.add(nextId)
    transaction = transaction.setNodeMarkup(
      pos,
      undefined,
      {
        ...node.attrs,
        [options.attributeName]: nextId,
      },
      node.marks,
    )
    changed = true
  })

  if (!changed) {
    return null
  }

  return transaction.setMeta(BLOCK_ID_TRANSACTION_META, true)
}

function createSyntheticEmptyParagraphCleanupTransaction(
  state: EditorState,
  attributeName: string,
): Transaction | null {
  const { doc } = state

  if (doc.childCount <= 1) {
    return null
  }

  let hasStableBlockId = false

  for (let index = 0; index < doc.childCount; index += 1) {
    if (readBlockId(doc.child(index), attributeName)) {
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

    if (shouldRemoveSyntheticParagraph(node, attributeName)) {
      transaction = transaction.delete(position, position + nodeSize)
      changed = true
      continue
    }

    position += nodeSize
  }

  if (!changed) {
    return null
  }

  return transaction.setMeta(BLOCK_ID_TRANSACTION_META, true)
}

function shouldRemoveSyntheticParagraph(node: ProseMirrorNode, attributeName: string) {
  return node.type.name === 'paragraph'
    && node.textContent.length === 0
    && !readBlockId(node, attributeName)
}

function shouldAssignBlockId(node: ProseMirrorNode, types: string[]): node is ProseMirrorNode & { type: { name: BodyBlockIdNodeType } } {
  return node.type.name !== 'doc' && node.isBlock && types.includes(node.type.name)
}

function readBlockId(node: ProseMirrorNode, attributeName: string) {
  const blockId = node.attrs[attributeName]

  if (!isBlockId(blockId)) {
    return null
  }

  return blockId
}

function generateUniqueBlockId(
  nodeType: BodyBlockIdNodeType,
  seenIds: Set<string>,
  generateId: (nodeType: BodyBlockIdNodeType) => string,
) {
  let blockId = generateId(nodeType)

  while (!blockId || seenIds.has(blockId)) {
    blockId = generateId(nodeType)
  }

  return blockId
}
