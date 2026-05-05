import type { AiAnchor } from '@haohaoxue/samepage-contracts'
import type { Editor, JSONContent } from '@tiptap/core'
import { AI_ANCHOR_KIND, TIPTAP_BODY_BLOCK_ID_ATTRIBUTE } from '@haohaoxue/samepage-contracts'
import { findBlockById } from '../commands/currentBlock'
import { createPlainTextPasteContent } from '../content/pasteContent'

export interface EditorAiCandidateWriteback {
  anchor: AiAnchor
  contentText: string
}

interface ResolvedEditorAiWriteback {
  from: number
  to: number
  content: string | JSONContent[]
}

export function canApplyEditorAiCandidateWriteback(
  editor: Editor,
  writeback: EditorAiCandidateWriteback,
): boolean {
  return Boolean(resolveEditorAiWriteback(editor, writeback))
}

export function acceptEditorAiCandidateWriteback(
  editor: Editor,
  writeback: EditorAiCandidateWriteback,
): boolean {
  const resolved = resolveEditorAiWriteback(editor, writeback)

  if (!resolved) {
    return false
  }

  return editor
    .chain()
    .focus()
    .insertContentAt({
      from: resolved.from,
      to: resolved.to,
    }, resolved.content)
    .run()
}

function resolveEditorAiWriteback(
  editor: Editor,
  writeback: EditorAiCandidateWriteback,
): ResolvedEditorAiWriteback | null {
  const contentText = writeback.contentText.trim()

  if (!editor.isEditable || !contentText || editor.isDestroyed) {
    return null
  }

  if (writeback.anchor.kind === AI_ANCHOR_KIND.BLOCK_INSERT) {
    return resolveBlockInsertWriteback(editor, writeback.anchor, contentText)
  }

  return resolveTextSelectionWriteback(editor, writeback.anchor, contentText)
}

function resolveBlockInsertWriteback(
  editor: Editor,
  anchor: Extract<AiAnchor, { kind: typeof AI_ANCHOR_KIND.BLOCK_INSERT }>,
  contentText: string,
): ResolvedEditorAiWriteback | null {
  const block = findBlockById(editor.state.doc, anchor.blockId)

  if (!block || block.node.type.name !== 'paragraph' || block.node.textContent.trim()) {
    return null
  }

  return {
    from: block.from,
    to: block.to,
    content: createCandidateParagraphContent(contentText, anchor.blockId),
  }
}

function resolveTextSelectionWriteback(
  editor: Editor,
  anchor: Extract<AiAnchor, { kind: typeof AI_ANCHOR_KIND.TEXT_SELECTION }>,
  contentText: string,
): ResolvedEditorAiWriteback | null {
  const block = findBlockById(editor.state.doc, anchor.blockId)
  const blockContentStart = block ? block.from + 1 : 0
  const from = blockContentStart + anchor.from
  const to = blockContentStart + anchor.to

  if (
    !block
    || block.node.type.name !== 'paragraph'
    || anchor.to <= anchor.from
    || from < blockContentStart
    || to > block.to - 1
    || editor.state.doc.textBetween(from, to, ' ') !== anchor.selectedText
  ) {
    return null
  }

  return {
    from,
    to,
    content: contentText.includes('\n')
      ? createCandidateParagraphContent(contentText)
      : contentText,
  }
}

function createCandidateParagraphContent(contentText: string, firstBlockId?: string): JSONContent[] {
  const content = createPlainTextPasteContent(contentText)

  if (!firstBlockId || !content[0]) {
    return content
  }

  return [
    {
      ...content[0],
      attrs: {
        ...(content[0].attrs ?? {}),
        [TIPTAP_BODY_BLOCK_ID_ATTRIBUTE]: firstBlockId,
      },
    },
    ...content.slice(1),
  ]
}
