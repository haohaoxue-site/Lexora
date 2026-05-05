import type { AiAnchor } from '@haohaoxue/samepage-contracts'
import type { Editor } from '@tiptap/core'
import type { EditorAiAnchorRect, EditorAiPreviewAnchor } from './typing'
import { AI_ANCHOR_KIND, AI_EDITOR_FIELD, AI_EDITOR_WORKFLOW_KEY, TIPTAP_BODY_BLOCK_ID_ATTRIBUTE } from '@haohaoxue/samepage-contracts'
import { TextSelection } from '@tiptap/pm/state'
import { getCurrentBlock } from '../commands/currentBlock'

export interface ResolvedEditorAiAnchor {
  requestAnchor: AiAnchor
  previewAnchor: EditorAiPreviewAnchor
  workflowKey: typeof AI_EDITOR_WORKFLOW_KEY.GENERATE | typeof AI_EDITOR_WORKFLOW_KEY.REWRITE
  rect: EditorAiAnchorRect
}

export function resolveEditorAiGenerateAnchor(editor: Editor, documentId: string): ResolvedEditorAiAnchor | null {
  const { selection } = editor.state
  const currentBlock = getCurrentBlock(selection)
  const blockId = readBlockId(currentBlock?.node.attrs)

  if (
    !editor.isEditable
    || !selection.empty
    || !currentBlock
    || currentBlock.node.type.name !== 'paragraph'
    || currentBlock.node.textContent.trim()
    || !blockId
  ) {
    return null
  }

  return {
    workflowKey: AI_EDITOR_WORKFLOW_KEY.GENERATE,
    requestAnchor: {
      kind: AI_ANCHOR_KIND.BLOCK_INSERT,
      documentId,
      field: AI_EDITOR_FIELD.BODY,
      blockId,
    },
    previewAnchor: {
      kind: AI_ANCHOR_KIND.BLOCK_INSERT,
      from: currentBlock.from,
      to: currentBlock.to,
    },
    rect: editor.view.coordsAtPos(selection.from),
  }
}

export function resolveEditorAiRewriteAnchor(editor: Editor, documentId: string): ResolvedEditorAiAnchor | null {
  const resolvedSelection = resolveEditorAiRewriteSelection(editor)

  if (!resolvedSelection) {
    return null
  }

  return {
    workflowKey: AI_EDITOR_WORKFLOW_KEY.REWRITE,
    requestAnchor: {
      kind: AI_ANCHOR_KIND.TEXT_SELECTION,
      documentId,
      field: AI_EDITOR_FIELD.BODY,
      blockId: resolvedSelection.blockId,
      from: resolvedSelection.from,
      to: resolvedSelection.to,
      selectedText: resolvedSelection.selectedText,
    },
    previewAnchor: resolvedSelection.previewAnchor,
    rect: editor.view.coordsAtPos(resolvedSelection.previewAnchor.to),
  }
}

export function canUseEditorAiRewriteSelection(editor: Editor): boolean {
  return Boolean(resolveEditorAiRewriteSelection(editor))
}

function resolveEditorAiRewriteSelection(editor: Editor) {
  const { selection } = editor.state

  if (!editor.isEditable || selection.empty || !(selection instanceof TextSelection)) {
    return null
  }

  const currentBlock = getCurrentBlock(selection)
  const blockId = readBlockId(currentBlock?.node.attrs)
  const blockContentStart = currentBlock ? currentBlock.from + 1 : 0
  const selectedText = editor.state.doc.textBetween(selection.from, selection.to, ' ')

  if (
    !currentBlock
    || currentBlock.node.type.name !== 'paragraph'
    || !blockId
    || !selection.$from.sameParent(selection.$to)
    || selection.from < blockContentStart
    || selection.to > currentBlock.to - 1
    || !selectedText.trim()
    || selectedText !== selectedText.trim()
  ) {
    return null
  }

  return {
    blockId,
    from: selection.from - blockContentStart,
    to: selection.to - blockContentStart,
    selectedText,
    previewAnchor: {
      kind: AI_ANCHOR_KIND.TEXT_SELECTION,
      from: selection.from,
      to: selection.to,
    },
  }
}

function readBlockId(attrs: unknown) {
  if (!attrs || typeof attrs !== 'object') {
    return null
  }

  const blockId = (attrs as Record<string, unknown>)[TIPTAP_BODY_BLOCK_ID_ATTRIBUTE]
  return typeof blockId === 'string' && blockId ? blockId : null
}
