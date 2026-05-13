import type { Editor } from '@tiptap/core'
import type { TiptapEditorUploadedFile, TiptapEditorUploadedImage } from '../content/typing'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { ElMessage } from 'element-plus'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import {
  createAnimatedGifPasteFile,
  hasAnimatedGifPasteSource,
} from '../content/animatedGifPaste'
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
  const html = event.clipboardData.getData('text/html').trim()

  if (files.length) {
    event.preventDefault()
    void handleFilePaste(editor, files, options, html)
    return true
  }

  if (isSelectionInsideCodeBlock(editor)) {
    const text = event.clipboardData.getData('text/plain')

    if (!text.length) {
      return false
    }

    event.preventDefault()
    editor.view.dispatch(editor.state.tr.insertText(text).scrollIntoView())
    return true
  }

  const structuredContent = parseStructuredClipboardContent(
    event.clipboardData.getData(SAMEPAGE_BLOCK_CLIPBOARD_TYPE),
  )

  if (structuredContent?.length) {
    return editor.chain().focus().insertContent(structuredContent).run()
  }

  if (html.length) {
    if (options.uploadImage && hasAnimatedGifPasteSource(html)) {
      event.preventDefault()
      void handleAnimatedGifPaste(editor, html, options)
      return true
    }

    return editor.chain().focus().insertContent(html).run()
  }

  const text = event.clipboardData.getData('text/plain')

  if (!text.length) {
    return false
  }

  return editor.chain().focus().insertContent(createPlainTextPasteContent(text)).run()
}

function isSelectionInsideCodeBlock(editor: Editor) {
  const { $from, $to } = editor.state.selection

  return $from.parent.type.name === 'codeBlock' && $to.parent.type.name === 'codeBlock'
}

async function handleFilePaste(
  editor: Editor,
  files: readonly File[],
  options: PastePipelineOptions,
  html: string,
) {
  try {
    const uploadFiles = await mergeAnimatedGifIntoFiles(files, options, html)
    const content = await createFilePasteContent(uploadFiles, {
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

async function handleAnimatedGifPaste(
  editor: Editor,
  html: string,
  options: PastePipelineOptions,
) {
  try {
    const animatedGifFile = await createAnimatedGifPasteFile(html)

    if (!animatedGifFile) {
      editor.chain().focus().insertContent(html).run()
      return
    }

    const content = await createFilePasteContent([animatedGifFile], {
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

async function mergeAnimatedGifIntoFiles(
  files: readonly File[],
  options: PastePipelineOptions,
  html: string,
): Promise<readonly File[]> {
  if (!options.uploadImage || !html || !hasAnimatedGifPasteSource(html)) {
    return files
  }

  try {
    const animatedGifFile = await createAnimatedGifPasteFile(html)

    if (!animatedGifFile) {
      return files
    }

    return [
      animatedGifFile,
      ...files.filter(file => !file.type.startsWith('image/')),
    ]
  }
  catch {
    // Clipboard files are still a valid paste result; GIF replacement is best-effort.
    return files
  }
}
