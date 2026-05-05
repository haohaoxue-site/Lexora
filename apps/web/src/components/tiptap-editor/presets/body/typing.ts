import type {
  TiptapEditorCollaborationBinding,
  TiptapEditorCommentRequest,
  TiptapEditorContent,
} from '../../core/typing'

export interface DocumentBodyEditorProps {
  /**
   * 文档 ID
   * @description 用于图片上传与资源解析
   */
  documentId?: string | null
  /**
   * 协作绑定
   * @description 接入同一个 Y.Doc 的 body field
   */
  collaboration?: TiptapEditorCollaborationBinding | null
  /**
   * 正文
   * @description 正文内容节点数组
   */
  content: TiptapEditorContent
  /**
   * 激活块 ID
   * @description 用于块链接或外层导航后的精确定位
   */
  activeBlockId?: string | null
  /**
   * 是否可编辑
   * @description 历史预览时关闭编辑能力
   */
  editable?: boolean
  /**
   * 是否展示大纲浮层
   * @description 分享阅读页会关闭编辑器专属浮层
   */
  showOutline?: boolean
}

export interface DocumentBodyEditorEmits {
  'update:content': [content: TiptapEditorContent]
  'contentError': [error: Error]
  'requestComment': [request: TiptapEditorCommentRequest]
}
