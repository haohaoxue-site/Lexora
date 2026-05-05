import type { Editor } from '@tiptap/core'
import type { ShallowRef, TemplateRef } from 'vue'
import type {
  TiptapEditorCommentRequest,
  TiptapEditorHandleKeyDown,
} from '../../core/typing'
import type { BlockTriggerMenuExposed } from '../../overlays/block-trigger/typing'
import type { DocumentBodyEditorProps } from './typing'
import {
  computed,
  nextTick,
  shallowRef,
  watch,
} from 'vue'
import {
  uploadDocumentFile,
  uploadDocumentImage,
} from '@/apis/document'
import { useEditorAiComposer } from '../../ai/useEditorAiComposer'
import { createBodyExtensions } from '../../extensions/createExtensions'
import { scrollDocumentBlockIntoView } from '../../overlays/block-trigger/blockTriggerDom'
import { isTriggerMenuSelection } from './triggerSelection'

export function useDocumentBodyEditor(options: {
  blockTriggerMenuRef: TemplateRef<BlockTriggerMenuExposed | null>
  bodyEditor: ShallowRef<Editor | null>
  onRequestComment: (request: TiptapEditorCommentRequest) => void
  props: DocumentBodyEditorProps
}) {
  const bodyEditorExtensions = createBodyExtensions({
    uploadImage: handleUploadImage,
    uploadFile: handleUploadFile,
    collaboration: options.props.collaboration,
  })
  const bodyEditor = computed(() => options.bodyEditor.value)
  const editorAiComposer = useEditorAiComposer({
    editor: options.bodyEditor,
    getDocumentId: () => options.props.documentId,
    getEditable: () => options.props.editable !== false,
  })
  const pendingActiveBlockId = shallowRef<string | null>(null)
  const isResolvingActiveBlock = shallowRef(false)

  watch(
    [
      bodyEditor,
      () => options.props.activeBlockId,
    ],
    async ([editor, activeBlockId]) => {
      pendingActiveBlockId.value = activeBlockId ?? null

      if (!editor || !activeBlockId) {
        return
      }

      await scrollToPendingActiveBlock(editor)
    },
    {
      immediate: true,
      flush: 'post',
    },
  )

  watch(
    [
      bodyEditor,
      () => options.props.content,
    ],
    async ([editor]) => {
      if (!editor || !pendingActiveBlockId.value) {
        return
      }

      await scrollToPendingActiveBlock(editor)
    },
    {
      flush: 'post',
    },
  )

  const handleBodyEditorKeyDown: TiptapEditorHandleKeyDown = (_, event) => {
    const editor = bodyEditor.value

    if (!options.props.editable || !editor) {
      return false
    }

    if (editorAiComposer.openGenerateFromKeyboard(event)) {
      return true
    }

    if (event.key !== '/' || !isTriggerMenuSelection(editor)) {
      return false
    }

    const opened = options.blockTriggerMenuRef.value?.openMenu() ?? false

    if (!opened) {
      return false
    }

    event.preventDefault()
    return true
  }

  function handleCommentRequest(request: TiptapEditorCommentRequest) {
    options.onRequestComment(request)
  }

  function handleBodyEditorChange(editor: Editor | null) {
    options.bodyEditor.value = editor
  }

  return {
    bodyEditor,
    bodyEditorExtensions,
    editorAiComposer,
    handleBodyEditorChange,
    handleBodyEditorKeyDown,
    handleCommentRequest,
    handleUploadFile,
    handleUploadImage,
  }

  async function handleUploadImage(file: File) {
    if (!options.props.documentId) {
      throw new Error('当前文档未初始化，无法上传图片')
    }

    return uploadDocumentImage(options.props.documentId, file)
  }

  async function handleUploadFile(file: File) {
    if (!options.props.documentId) {
      throw new Error('当前文档未初始化，无法上传附件')
    }

    return uploadDocumentFile(options.props.documentId, file)
  }

  async function scrollToPendingActiveBlock(editor: Editor) {
    const blockId = pendingActiveBlockId.value

    if (!blockId || isResolvingActiveBlock.value) {
      return
    }

    isResolvingActiveBlock.value = true

    try {
      await nextTick()

      if (!scrollDocumentBlockIntoView(editor, blockId)) {
        return
      }

      pendingActiveBlockId.value = null
    }
    finally {
      isResolvingActiveBlock.value = false
    }
  }
}
