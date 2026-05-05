import type { TiptapJsonContent } from '@haohaoxue/samepage-contracts'
import type {
  TiptapEditorCollaborationBinding,
  TiptapEditorCommentRequest,
} from '../../core/typing'

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
  /** 标题协作绑定 */
  titleCollaboration?: TiptapEditorCollaborationBinding | null
  /** 正文协作绑定 */
  bodyCollaboration?: TiptapEditorCollaborationBinding | null
  /** 当前 URL 对应的块 ID */
  activeBlockId?: string | null
  /** 是否展示大纲 */
  showOutline?: boolean
}

/**
 * 文档内容面事件。
 */
export interface DocumentContentSurfaceEmits {
  updateTitle: [title: TiptapJsonContent]
  updateContent: [content: TiptapJsonContent]
  contentError: [error: Error]
  requestComment: [request: TiptapEditorCommentRequest]
}
