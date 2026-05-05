import type { Editor } from '@tiptap/core'
import type { TiptapEditorUploadedFile, TiptapEditorUploadedImage } from '../content/typing'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { ElMessage } from 'element-plus'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import {
  parseStructuredClipboardContent,
  SAMEPAGE_BLOCK_CLIPBOARD_TYPE,
} from '../content/blockClipboard'
import { createFilePasteContent, createPlainTextPasteContent } from '../content/pasteContent'

export interface PastePipelineOptions {
  uploadImage?: (file: File) => Promise<TiptapEditorUploadedImage>
  uploadFile?: (file: File) => Promise<TiptapEditorUploadedFile>
}

export const PastePipeline = Extension.create<PastePipelineOptions>({
  name: 'pastePipeline',

  addOptions() {
    return {
      uploadImage: undefined,
      uploadFile: undefined,
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey(this.name),
        props: {
          handlePaste: (_, event) => handleEditorPaste(this.editor, event, this.options),
        },
      }),
    ]
  },
})

function handleEditorPaste(editor: Editor, event: ClipboardEvent, options: PastePipelineOptions) {
  if (!editor.isEditable || !event.clipboardData) {
    return false
  }

  const files = Array.from(event.clipboardData.files ?? [])

  if (files.length) {
    event.preventDefault()
    void handleFilePaste(editor, files, options)
    return true
  }

  const structuredContent = parseStructuredClipboardContent(
    event.clipboardData.getData(SAMEPAGE_BLOCK_CLIPBOARD_TYPE),
  )

  if (structuredContent?.length) {
    return editor.chain().focus().insertContent(structuredContent).run()
  }

  const html = event.clipboardData.getData('text/html').trim()

  if (html.length) {
    return editor.chain().focus().insertContent(html).run()
  }

  const text = event.clipboardData.getData('text/plain')

  if (!text.length) {
    return false
  }

  return editor.chain().focus().insertContent(createPlainTextPasteContent(text)).run()
}

async function handleFilePaste(editor: Editor, files: readonly File[], options: PastePipelineOptions) {
  try {
    const content = await createFilePasteContent(files, {
      uploadImage: options.uploadImage,
      uploadFile: options.uploadFile,
    })

    if (!content.length) {
      return
    }

    editor.chain().focus().insertContent(content).run()
  }
  catch (error) {
    ElMessage.error(getRequestErrorDisplayMessage(error, '资源上传失败'))
  }
}
