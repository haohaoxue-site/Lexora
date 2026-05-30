import type { DocumentPageWidthMode, TiptapJsonContent } from '@haohaoxue/samepage-contracts'
import type {
  TiptapEditorCollaborationBinding,
  TiptapEditorCommentRequest,
  TiptapEditorSelectionContextRequest,
} from '../../core/typing'

/**
 * 文档内容面页脚元信息。
 */
export interface DocumentContentSurfaceFooterMetaItem {
  /** 元信息名称 */
  label: string
  /** 元信息展示值 */
  value: string
}

/**
 * 文档内容面属性。
 */
export interface DocumentContentSurfaceProps {
  /** 文档 ID */
  documentId?: string | null
  /** 标题内容 */
  title: TiptapJsonContent
  /** 正文内容 */
  body: TiptapJsonContent
  /** 是否可编辑 */
  editable?: boolean
  /** 是否应自动聚焦标题 */
  autofocusTitle?: boolean
  /** 标题协作绑定 */
  titleCollaboration?: TiptapEditorCollaborationBinding | null
  /** 正文协作绑定 */
  bodyCollaboration?: TiptapEditorCollaborationBinding | null
  /** 当前 URL 对应的块 ID */
  activeBlockId?: string | null
  /** 页面宽度模式 */
  pageWidthMode?: DocumentPageWidthMode
  /** 是否展示大纲 */
  showOutline?: boolean
  /** 页脚元信息 */
  footerMetaItems?: DocumentContentSurfaceFooterMetaItem[]
}

/**
 * 文档内容面事件。
 */
export interface DocumentContentSurfaceEmits {
  updateTitle: [title: TiptapJsonContent]
  updateContent: [content: TiptapJsonContent]
  contentError: [error: Error]
  requestComment: [request: TiptapEditorCommentRequest]
  requestAddSelectionContext: [request: TiptapEditorSelectionContextRequest]
  titleAutofocusApplied: []
}
