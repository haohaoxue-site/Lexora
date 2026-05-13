import type { Editor } from '@tiptap/core'
import { getCurrentBlock } from '../../commands/currentBlock'
import { resolveCurrentBlockElement } from './blockTriggerDom'

const LIST_BLOCK_NODE_TYPES = new Set(['listItem', 'taskItem'])
const LIST_MARKER_SAFE_OFFSET = 18

export function resolveBlockTriggerAnchorRect(editor: Editor): DOMRect {
  const currentBlock = getCurrentBlock(editor.state.selection)

  if (!currentBlock) {
    throw new Error('[samepage:tiptap] 当前选区未命中块节点，无法定位块菜单')
  }

  if (typeof editor.view.coordsAtPos !== 'function') {
    throw new TypeError('[samepage:tiptap] 编辑器视图缺少 coordsAtPos，无法定位块菜单')
  }

  if (!(editor.view.dom instanceof HTMLElement) || typeof editor.view.dom.getBoundingClientRect !== 'function') {
    throw new TypeError('[samepage:tiptap] 编辑器视图缺少 ProseMirror 根节点，无法定位块菜单')
  }

  const cursorRect = editor.view.coordsAtPos(editor.state.selection.from)
  const blockElement = resolveCurrentBlockElement(editor, currentBlock)
  const blockRect = blockElement.getBoundingClientRect()
  const anchorLeft = resolveBlockTriggerAnchorLeft(currentBlock.node.type.name, blockElement, blockRect.left)
  const data = {
    top: cursorRect.top,
    bottom: cursorRect.bottom,
    left: anchorLeft,
    right: anchorLeft,
    width: 0,
    height: Math.max(cursorRect.bottom - cursorRect.top, 0),
    x: anchorLeft,
    y: cursorRect.top,
  }

  return {
    ...data,
    toJSON: () => data,
  } satisfies DOMRect
}

function resolveBlockTriggerAnchorLeft(nodeTypeName: string, blockElement: HTMLElement, fallbackLeft: number) {
  if (!LIST_BLOCK_NODE_TYPES.has(nodeTypeName)) {
    return fallbackLeft
  }

  const listElement = blockElement.closest<HTMLElement>('ul, ol')

  if (!listElement) {
    return fallbackLeft
  }

  const listLeft = listElement.getBoundingClientRect().left
  return Math.min(Math.max(listLeft, fallbackLeft - LIST_MARKER_SAFE_OFFSET), fallbackLeft)
}
