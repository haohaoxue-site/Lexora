import type { Editor, EditorEvents } from '@tiptap/core'
import type { Ref } from 'vue'
import type { ActiveDocumentDetail } from '../typing'
import type {
  ChatComposerAttachment,
  ChatComposerSubmitPayload,
} from '@/components/chat-composer/typing'
import {
  CHAT_MESSAGE_ATTACHMENT_PLACEMENT,
  CHAT_MESSAGE_ATTACHMENT_TYPE,
} from '@haohaoxue/lexora-contracts/chat/constants'
import { getDocumentTitlePlainText } from '@haohaoxue/lexora-shared/document'
import { TextSelection } from '@tiptap/pm/state'
import { nanoid } from 'nanoid'
import {
  getCurrentScope,
  onScopeDispose,
  watch,
} from 'vue'
import { translate } from '@/i18n'
import { createDocsSelectionSnapshot, mapDocsSelectionLiveRange } from '../utils/docsSelectionContext'
import { useActiveDocument } from './useActiveDocument'
import { useDocsChatPanel } from './useDocsChatPanel'

export interface DocsSelectionContextRequest {
  editor: Editor
  from: number
  to: number
}

interface DocsSelectionContextDocument {
  id: ActiveDocumentDetail['id']
  title: ActiveDocumentDetail['title']
}

interface DocsSelectionAnchor {
  attachmentId: string
  documentId: string
  editor: Editor
  from: number
  to: number
}

interface DocsChatContextBridgePanel {
  attachments: Ref<ChatComposerAttachment[]>
  clearSelectionContexts: () => void
  highlightAttachment: (attachmentId: string) => void
  openPanel: () => void
  registerBeforeSendHandler: (handler: (payload: ChatComposerSubmitPayload) => ChatComposerSubmitPayload) => () => boolean
  requestComposerFocus: () => void
}

export function useDocsChatContextBridge() {
  const { currentDocument } = useActiveDocument()
  const panel = useDocsChatPanel()

  return createDocsChatContextBridgeController({
    currentDocument,
    panel,
  })
}

export function createDocsChatContextBridgeController(options: {
  currentDocument: Ref<DocsSelectionContextDocument | null>
  panel: DocsChatContextBridgePanel
  createAttachmentId?: () => string
}) {
  const anchors = new Map<string, DocsSelectionAnchor>()
  const editorTransactionHandlers = new Map<Editor, (event: EditorEvents['transaction']) => void>()
  const createAttachmentId = options.createAttachmentId ?? (() => `att_${nanoid(10)}`)
  const unregisterBeforeSend = options.panel.registerBeforeSendHandler(refreshSelectionSnapshotsForSend)
  const stopDocumentWatch = watch(
    () => options.currentDocument.value?.id ?? null,
    () => clearAllSelectionContexts(),
  )
  const stopAttachmentWatch = watch(
    () => options.panel.attachments.value
      .filter(attachment => attachment.scope.kind === 'selection')
      .map(attachment => attachment.id)
      .join('\n'),
    () => pruneDetachedSelectionAnchors(),
    { flush: 'sync' },
  )

  if (getCurrentScope()) {
    onScopeDispose(dispose)
  }

  function handleAddSelectionContext(request: DocsSelectionContextRequest) {
    pruneDetachedSelectionAnchors()

    const document = options.currentDocument.value
    const range = resolveRequestTextSelectionRange(request)

    if (!document || !range) {
      return false
    }

    const snapshot = createDocsSelectionSnapshot(request.editor, range)

    if (!snapshot) {
      return false
    }

    const duplicateAnchor = findDuplicateAnchor({
      editor: request.editor,
      documentId: document.id,
      from: range.from,
      to: range.to,
    })

    if (duplicateAnchor) {
      options.panel.openPanel()
      options.panel.highlightAttachment(duplicateAnchor.attachmentId)
      options.panel.requestComposerFocus()
      collapseEditorSelection(request.editor, range.to)
      return false
    }

    const attachment: ChatComposerAttachment = {
      id: createAttachmentId(),
      type: CHAT_MESSAGE_ATTACHMENT_TYPE.DOCUMENT,
      placement: CHAT_MESSAGE_ATTACHMENT_PLACEMENT.PANEL,
      documentId: document.id,
      title: resolveDocumentTitle(document),
      scope: snapshot.scope,
      snapshot: snapshot.snapshot,
      size: snapshot.size,
    }

    anchors.set(attachment.id, {
      attachmentId: attachment.id,
      documentId: document.id,
      editor: request.editor,
      from: range.from,
      to: range.to,
    })
    ensureEditorTransactionHandler(request.editor)
    options.panel.attachments.value = [
      ...options.panel.attachments.value,
      attachment,
    ]
    collapseEditorSelection(request.editor, range.to)
    options.panel.openPanel()
    options.panel.requestComposerFocus()
    return true
  }

  function refreshSelectionSnapshotsForSend(payload: ChatComposerSubmitPayload): ChatComposerSubmitPayload {
    const nextPanelAttachments = refreshSelectionAttachments(options.panel.attachments.value)
    const nextPanelAttachmentById = new Map(nextPanelAttachments.map(attachment => [attachment.id, attachment]))

    if (nextPanelAttachments !== options.panel.attachments.value) {
      options.panel.attachments.value = nextPanelAttachments
    }

    return {
      ...payload,
      attachments: payload.attachments.flatMap((attachment) => {
        if (attachment.scope.kind !== 'selection') {
          return [attachment]
        }

        const nextAttachment = nextPanelAttachmentById.get(attachment.id)

        return nextAttachment ? [nextAttachment] : []
      }),
    }
  }

  function refreshSelectionAttachments(attachments: ChatComposerAttachment[]) {
    let changed = false
    const nextAttachments: ChatComposerAttachment[] = []

    for (const attachment of attachments) {
      if (attachment.scope.kind !== 'selection') {
        nextAttachments.push(attachment)
        continue
      }

      const anchor = anchors.get(attachment.id)

      if (!anchor) {
        changed = true
        continue
      }

      const snapshot = createDocsSelectionSnapshot(anchor.editor, {
        from: anchor.from,
        to: anchor.to,
      })

      if (!snapshot) {
        anchors.delete(attachment.id)
        cleanupEditorTransactionHandler(anchor.editor)
        changed = true
        continue
      }

      const nextAttachment = {
        ...attachment,
        scope: snapshot.scope,
        snapshot: snapshot.snapshot,
        size: snapshot.size,
      }

      nextAttachments.push(nextAttachment)

      if (nextAttachment !== attachment) {
        changed = true
      }
    }

    return changed ? nextAttachments : attachments
  }

  function ensureEditorTransactionHandler(editor: Editor) {
    if (editorTransactionHandlers.has(editor)) {
      return
    }

    const handler = (event: EditorEvents['transaction']) => {
      mapEditorAnchors(editor, event.transaction)
    }

    editor.on('transaction', handler)
    editorTransactionHandlers.set(editor, handler)
  }

  function mapEditorAnchors(editor: Editor, transaction: EditorEvents['transaction']['transaction']) {
    const removedAttachmentIds: string[] = []

    for (const anchor of anchors.values()) {
      if (anchor.editor !== editor) {
        continue
      }

      const mappedRange = mapDocsSelectionLiveRange({
        from: anchor.from,
        to: anchor.to,
      }, transaction)

      if (!mappedRange) {
        removedAttachmentIds.push(anchor.attachmentId)
        continue
      }

      anchor.from = mappedRange.from
      anchor.to = mappedRange.to
    }

    if (!removedAttachmentIds.length) {
      return
    }

    options.panel.attachments.value = options.panel.attachments.value.filter(attachment =>
      !removedAttachmentIds.includes(attachment.id),
    )

    for (const attachmentId of removedAttachmentIds) {
      const anchor = anchors.get(attachmentId)
      anchors.delete(attachmentId)

      if (anchor) {
        cleanupEditorTransactionHandler(anchor.editor)
      }
    }
  }

  function clearAllSelectionContexts() {
    anchors.clear()
    for (const [editor, handler] of editorTransactionHandlers) {
      editor.off('transaction', handler)
    }
    editorTransactionHandlers.clear()
    options.panel.clearSelectionContexts()
  }

  function dispose() {
    stopDocumentWatch()
    stopAttachmentWatch()
    unregisterBeforeSend()
    clearAllSelectionContexts()
  }

  return {
    dispose,
    handleAddSelectionContext,
  }

  function findDuplicateAnchor(input: {
    documentId: string
    editor: Editor
    from: number
    to: number
  }) {
    for (const anchor of anchors.values()) {
      if (
        anchor.documentId === input.documentId
        && anchor.editor === input.editor
        && anchor.from === input.from
        && anchor.to === input.to
      ) {
        return anchor
      }
    }

    return null
  }

  function cleanupEditorTransactionHandler(editor: Editor) {
    for (const anchor of anchors.values()) {
      if (anchor.editor === editor) {
        return
      }
    }

    const handler = editorTransactionHandlers.get(editor)

    if (!handler) {
      return
    }

    editor.off('transaction', handler)
    editorTransactionHandlers.delete(editor)
  }

  function pruneDetachedSelectionAnchors() {
    const activeSelectionAttachmentIds = new Set(
      options.panel.attachments.value
        .filter(attachment => attachment.scope.kind === 'selection')
        .map(attachment => attachment.id),
    )

    for (const [attachmentId, anchor] of anchors) {
      if (activeSelectionAttachmentIds.has(attachmentId)) {
        continue
      }

      anchors.delete(attachmentId)
      cleanupEditorTransactionHandler(anchor.editor)
    }
  }
}

function resolveRequestTextSelectionRange(request: DocsSelectionContextRequest) {
  const selection = request.editor.state.selection

  if (!isTextSelection(selection) || selection.empty) {
    return null
  }

  const from = Math.min(request.from, request.to)
  const to = Math.max(request.from, request.to)

  if (from >= to) {
    return null
  }

  return {
    from,
    to,
  }
}

function isTextSelection(selection: unknown): selection is TextSelection {
  return selection instanceof TextSelection
}

function resolveDocumentTitle(document: DocsSelectionContextDocument) {
  return getDocumentTitlePlainText(document.title) || translate('docs.common.noTitle')
}

function collapseEditorSelection(editor: Editor, position: number) {
  editor.commands.setTextSelection(position)
}
