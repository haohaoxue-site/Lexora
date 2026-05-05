import type { TiptapJsonContent, TiptapJsonNode } from '@haohaoxue/samepage-contracts'

export function unwrapTiptapContent(content: TiptapJsonNode): TiptapJsonContent {
  if (!Array.isArray(content.content) || !content.content.length) {
    return []
  }

  const normalizedContent = JSON.parse(JSON.stringify(content.content)) as TiptapJsonContent

  return isEmptyParagraphContent(normalizedContent) ? [] : normalizedContent
}

export function wrapTiptapContent(content: TiptapJsonContent): TiptapJsonNode {
  return {
    type: 'doc',
    content: content.length ? content : createEmptyTiptapContent(),
  }
}

export function createEmptyTiptapContent(): TiptapJsonContent {
  return [{ type: 'paragraph' }]
}

function isEmptyParagraphContent(content: TiptapJsonContent) {
  if (content.length !== 1) {
    return false
  }

  return isEmptyParagraphNode(content[0])
}

function isEmptyParagraphNode(node: TiptapJsonNode | undefined) {
  if (!node || node.type !== 'paragraph') {
    return false
  }

  if (!Array.isArray(node.content) || node.content.length === 0) {
    return true
  }

  return node.content.every(child =>
    child?.type === 'text' && typeof child.text === 'string' && child.text.length === 0,
  )
}
