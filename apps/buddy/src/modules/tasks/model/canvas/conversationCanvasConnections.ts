import type { ConversationCanvasDirection, ConversationCanvasNode } from './conversationCanvasLayout'
import { conversationNodeSize } from './conversationCanvasLayout'

interface ConversationConnectionNode {
  message: ConversationCanvasNode
  position: { x: number, y: number }
}

export function conversationCanvasConnection(source: ConversationConnectionNode, target: ConversationConnectionNode, direction: ConversationCanvasDirection) {
  const horizontal = direction === 'horizontal'
  const from = conversationNodeSize(source.message)
  const to = conversationNodeSize(target.message)
  const sourceAnchor = horizontal
    ? { x: from.width, y: from.height / 2 }
    : { x: from.width / 2, y: from.height }
  const targetAnchor = horizontal
    ? { x: 0, y: to.height / 2 }
    : { x: to.width / 2, y: 0 }
  const start = { x: source.position.x + sourceAnchor.x, y: source.position.y + sourceAnchor.y }
  const end = { x: target.position.x + targetAnchor.x, y: target.position.y + targetAnchor.y }
  if (horizontal) {
    const mid = (start.x + end.x) / 2
    return { sourceAnchor, targetAnchor, vertices: [{ x: mid, y: start.y }, { x: mid, y: end.y }] }
  }
  const mid = (start.y + end.y) / 2
  return {
    sourceAnchor,
    targetAnchor,
    vertices: [{ x: start.x, y: mid }, { x: end.x, y: mid }],
  }
}
