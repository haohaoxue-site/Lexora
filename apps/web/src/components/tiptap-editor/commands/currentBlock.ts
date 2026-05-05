import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Selection } from '@tiptap/pm/state'

const CURRENT_BLOCK_NODE_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'listItem',
  'taskItem',
])

const PARAGRAPH_PARENT_NODE_TYPES = new Set([
  'blockquote',
  'listItem',
  'taskItem',
])

export interface CurrentBlockSelection {
  node: ProseMirrorNode
  parent: ProseMirrorNode
  index: number
  from: number
  to: number
}

export function getCurrentBlock(selection: Selection): CurrentBlockSelection | null {
  const { $from } = selection

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)

    if (!shouldUseCurrentBlock(node, depth, selection)) {
      continue
    }

    return {
      node,
      parent: $from.node(depth - 1),
      index: $from.index(depth - 1),
      from: $from.before(depth),
      to: $from.after(depth),
    }
  }

  return null
}

export function findBlockById(doc: ProseMirrorNode, blockId: string): CurrentBlockSelection | null {
  let matchedBlock: CurrentBlockSelection | null = null

  doc.descendants((node, pos, parent, index) => {
    if (matchedBlock || !shouldUseMatchedBlock(node, blockId, parent)) {
      return
    }

    const matchedParent = parent!

    matchedBlock = {
      node,
      parent: matchedParent,
      index,
      from: pos,
      to: pos + node.nodeSize,
    }
  })

  return matchedBlock
}

function shouldUseCurrentBlock(node: ProseMirrorNode, depth: number, selection: Selection) {
  if (!CURRENT_BLOCK_NODE_TYPES.has(node.type.name)) {
    return false
  }

  if (node.type.name !== 'paragraph') {
    return true
  }

  return !PARAGRAPH_PARENT_NODE_TYPES.has(selection.$from.node(depth - 1)?.type.name)
}

function shouldUseMatchedBlock(
  node: ProseMirrorNode,
  blockId: string,
  parent: ProseMirrorNode | null,
) {
  if (!parent || !CURRENT_BLOCK_NODE_TYPES.has(node.type.name)) {
    return false
  }

  return typeof node.attrs.id === 'string' && node.attrs.id === blockId
}
