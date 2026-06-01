import type {
  TiptapEditorCollaborationBinding,
  TiptapEditorCommentRequest,
  TiptapEditorContent,
  TiptapEditorSelectionContextRequest,
} from '../../core/typing'

export interface DocumentBodyEditorOutlineOptions {
  defaultExpanded?: boolean
  layout?: 'overlay' | 'side'
  mode?: 'hover' | 'manual'
  placement?: 'left' | 'right'
  showSearch?: boolean
  surface?: 'card' | 'transparent'
}

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
   * @description 可按阅读或编辑场景配置展开方式
   */
  showOutline?: boolean
  /**
   * 大纲展示参数
   * @description 普通编辑器默认悬停展开；公开阅读页可配置为右侧常驻大纲
   */
  outlineOptions?: DocumentBodyEditorOutlineOptions
}

export interface DocumentBodyEditorEmits {
  'update:content': [content: TiptapEditorContent]
  'contentError': [error: Error]
  'requestComment': [request: TiptapEditorCommentRequest]
  'requestAddSelectionContext': [request: TiptapEditorSelectionContextRequest]
}
