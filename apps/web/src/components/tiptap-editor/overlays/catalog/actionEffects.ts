import type { Editor } from '@tiptap/core'
import type { Ref } from 'vue'
import type { TiptapEditorUploadedFile, TiptapEditorUploadedImage } from '../../content/typing'
import type {
  TiptapEditorCommentRequest,
  TiptapEditorCommentTriggerSource,
} from '../../core/typing'
import type { LinkPanelController } from '../shared/useLinkPanel'
import { ElMessage, ElMessageBox } from '@/utils/element-plus'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import { getCurrentImageAlt, insertEditorContent, updateCurrentImageAlt } from '../../commands/editorActions'
import { createUploadedFileInsertContent, createUploadedImageInsertContent } from '../../content/documentAsset'

/** 菜单动作副作用参数。 */
export interface MenuActionEffectsOptions {
  /** 编辑器实例 */
  editor: Editor
  /** 链接面板控制器 */
  linkPanel?: LinkPanelController
  /** 菜单关闭能力 */
  closeMenu?: () => void
  /** 评论请求回调 */
  onRequestComment?: (request: TiptapEditorCommentRequest) => void
  /** 请求 AI 改写 */
  onRequestAiRewrite?: () => void
  onRequestAddSelectionContext?: () => void
  /** 评论来源 */
  commentSource?: TiptapEditorCommentTriggerSource
  /** 图片选择输入框 */
  imageInputRef?: Ref<HTMLInputElement | null>
  /** 文件选择输入框 */
  fileInputRef?: Ref<HTMLInputElement | null>
  /** 图片上传能力 */
  uploadImage?: (file: File) => Promise<TiptapEditorUploadedImage>
  /** 文件上传能力 */
  uploadFile?: (file: File) => Promise<TiptapEditorUploadedFile>
}

/** 菜单动作副作用控制器。 */
export interface MenuActionEffects {
  /** 执行动作后关闭菜单 */
  runAndCloseMenu: (action: () => void) => void
  /** 执行剪贴板动作 */
  runClipboardAction: (action: () => Promise<boolean>, fallbackMessage: string) => Promise<void>
  /** 请求评论 */
  requestComment: () => void
  /** 请求 AI 改写 */
  requestAiRewrite: () => void
  requestAddSelectionContext: () => void
  /** 编辑图片描述 */
  editImageAlt: () => Promise<void>
  /** 切换链接面板 */
  toggleLinkPanel: () => void
  /** 打开空块链接面板 */
  openEmptyBlockLinkPanel: () => void
  /** 打开图片选择器 */
  pickImage: () => void
  /** 打开文件选择器 */
  pickFile: () => void
  /** 处理上传插入 */
  handleFileInsert: (event: Event, kind: 'image' | 'file') => Promise<void>
}

export function createMenuActionEffects(options: MenuActionEffectsOptions): MenuActionEffects {
  return {
    runAndCloseMenu,
    runClipboardAction,
    requestComment,
    requestAiRewrite,
    requestAddSelectionContext,
    editImageAlt,
    toggleLinkPanel,
    openEmptyBlockLinkPanel,
    pickImage,
    pickFile,
    handleFileInsert,
  }

  function runAndCloseMenu(action: () => void) {
    action()
    options.closeMenu?.()
  }

  async function runClipboardAction(action: () => Promise<boolean>, fallbackMessage: string) {
    try {
      const handled = await action()

      if (!handled) {
        ElMessage.error(fallbackMessage)
        return
      }

      options.closeMenu?.()
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, fallbackMessage))
    }
  }

  function requestComment() {
    options.onRequestComment?.({
      source: options.commentSource ?? 'bubble-toolbar',
    })
    options.closeMenu?.()
  }

  function requestAiRewrite() {
    options.onRequestAiRewrite?.()
    options.closeMenu?.()
  }

  function requestAddSelectionContext() {
    options.onRequestAddSelectionContext?.()
    options.closeMenu?.()
  }

  async function editImageAlt() {
    try {
      const { value } = await ElMessageBox.prompt(
        '请输入图片描述，将写入图片 alt 字段。',
        '编辑描述',
        {
          inputValue: getCurrentImageAlt(options.editor),
          inputPlaceholder: '输入图片描述',
          confirmButtonText: '保存',
          cancelButtonText: '取消',
        },
      )

      runAndCloseMenu(() => updateCurrentImageAlt(options.editor, value ?? ''))
    }
    catch (error) {
      if (error === 'cancel' || error === 'close') {
        return
      }

      ElMessage.error(getRequestErrorDisplayMessage(error, '更新图片描述失败'))
    }
  }

  function toggleLinkPanel() {
    options.linkPanel?.toggle()
  }

  function openEmptyBlockLinkPanel() {
    options.linkPanel?.openEmptyBlock()
  }

  function pickImage() {
    options.imageInputRef?.value?.click()
  }

  function pickFile() {
    options.fileInputRef?.value?.click()
  }

  async function handleFileInsert(event: Event, kind: 'image' | 'file') {
    const input = event.target

    if (!(input instanceof HTMLInputElement)) {
      return
    }

    const [file] = Array.from(input.files ?? [])
    input.value = ''

    if (!file) {
      return
    }

    try {
      if (kind === 'image') {
        if (!options.uploadImage) {
          return
        }

        const uploadedImage = await options.uploadImage(file)
        insertEditorContent(options.editor, createUploadedImageInsertContent(uploadedImage))
        options.closeMenu?.()
        return
      }

      if (!options.uploadFile) {
        return
      }

      const uploadedFile = await options.uploadFile(file)
      insertEditorContent(options.editor, createUploadedFileInsertContent(uploadedFile))
      options.closeMenu?.()
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, kind === 'image' ? '图片上传失败' : '附件上传失败'))
    }
  }
}
