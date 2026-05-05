import type { Editor } from '@tiptap/core'
import { getCurrentBlock } from '../../commands/currentBlock'
import { resolveCurrentBlockElement } from './blockTriggerDom'

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
  const blockRect = resolveCurrentBlockElement(editor, currentBlock).getBoundingClientRect()
  const data = {
    top: cursorRect.top,
    bottom: cursorRect.bottom,
    left: blockRect.left,
    right: blockRect.left,
    width: 0,
    height: Math.max(cursorRect.bottom - cursorRect.top, 0),
    x: blockRect.left,
    y: cursorRect.top,
  }

  return {
    ...data,
    toJSON: () => data,
  } satisfies DOMRect
}
