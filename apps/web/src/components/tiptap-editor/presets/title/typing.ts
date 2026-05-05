import type { TiptapJsonContent } from '@haohaoxue/samepage-contracts'
import type { TiptapEditorCollaborationBinding } from '../../core/typing'

export interface DocumentTitleEditorProps {
  /**
   * 标题
   * @description 文档标题轻量内容
   */
  title: TiptapJsonContent
  /**
   * 协作绑定
   * @description 接入同一个 Y.Doc 的 title field
   */
  collaboration?: TiptapEditorCollaborationBinding | null
  /**
   * 是否可编辑
   * @description 历史预览时关闭编辑能力
   */
  editable?: boolean
}

export interface DocumentTitleEditorEmits {
  'update:title': [title: TiptapJsonContent]
}
