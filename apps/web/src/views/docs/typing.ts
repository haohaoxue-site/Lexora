import type {
  DocumentPaneState,
  DocumentRecord,
  DocumentRevision,
  DocumentVersionSnapshot,
  TiptapJsonContent,
  TiptapSchemaVersion,
} from '@haohaoxue/lexora-contracts'
import type {
  TiptapEditorBlockContextRequest,
  TiptapEditorCollaborationBinding,
  TiptapEditorCommentRequest,
  TiptapEditorSelectionContextRequest,
} from '@/components/tiptap-editor'

/**
 * 文档页本地编辑态。
 */
export interface ActiveDocumentDetail extends Omit<DocumentRecord, 'currentProjectionId'> {
  currentProjectionId: string
  currentProjectionRevision: DocumentRevision
  schemaVersion: TiptapSchemaVersion
  title: TiptapJsonContent
  body: TiptapJsonContent
}

/**
 * 文档编辑模式。
 */
export type DocsDocumentEditorMode = 'default' | 'history'

/**
 * 文档协作连接状态视觉类型。
 */
export type DocsDocumentCollaborationStatusTone = 'neutral' | 'connecting' | 'connected' | 'danger'

/**
 * 文档页主区视图。
 */
export type DocsSurfaceView = 'document' | 'collaborations' | 'publication-settings' | 'trash'
export type DocumentDeleteAction = 'trash' | 'permanent'

/**
 * 文档协作绑定。
 */
export interface DocsDocumentEditorCollaborationBindings {
  /** 协作会话 key */
  sessionKey?: string
  /** 标题协作绑定 */
  title: TiptapEditorCollaborationBinding | null
  /** 正文协作绑定 */
  body: TiptapEditorCollaborationBinding | null
}

/**
 * 文档编辑区域属性。
 */
export interface DocsDocumentEditorPaneProps {
  document: ActiveDocumentDetail | null
  mode: DocsDocumentEditorMode
  /** 是否允许编辑 */
  editable?: boolean
  /** 是否应自动聚焦标题 */
  autofocusTitle?: boolean
  /** 协作绑定 */
  collaboration?: DocsDocumentEditorCollaborationBindings | null
  /** 当前 URL 对应的块 ID */
  activeBlockId?: string | null
  isLoading: boolean
  paneState: DocumentPaneState
  hasFallbackDocument: boolean
}

/**
 * 文档编辑区域事件。
 */
export interface DocsDocumentEditorPaneEmits {
  updateTitle: [title: TiptapJsonContent]
  updateContent: [content: TiptapJsonContent]
  requestComment: [request: TiptapEditorCommentRequest]
  requestAddSelectionContext: [request: TiptapEditorSelectionContextRequest]
  requestAiBlockRewrite: [request: TiptapEditorBlockContextRequest]
  selectionChange: [request: TiptapEditorSelectionContextRequest]
  titleAutofocusApplied: []
  createDocument: []
  openFallbackDocument: []
  retryLoad: []
}

/**
 * 文档编辑区属性。
 */
export interface DocsDocumentEditorProps {
  document: ActiveDocumentDetail
  mode: DocsDocumentEditorMode
  /** 是否允许编辑 */
  editable?: boolean
  /** 是否应自动聚焦标题 */
  autofocusTitle?: boolean
  /** 协作绑定 */
  collaboration?: DocsDocumentEditorCollaborationBindings | null
  /** 当前 URL 对应的块 ID */
  activeBlockId?: string | null
}

/**
 * 文档编辑区事件。
 */
export interface DocsDocumentEditorEmits {
  updateTitle: [title: TiptapJsonContent]
  updateContent: [content: TiptapJsonContent]
  contentError: [error: Error]
  requestComment: [request: TiptapEditorCommentRequest]
  requestAddSelectionContext: [request: TiptapEditorSelectionContextRequest]
  requestAiBlockRewrite: [request: TiptapEditorBlockContextRequest]
  selectionChange: [request: TiptapEditorSelectionContextRequest]
  titleAutofocusApplied: []
}

/**
 * 文档编辑回退态属性。
 */
export interface DocsDocumentEditorFallbackProps {
  paneState: DocumentPaneState
  isLoading: boolean
  hasFallbackDocument: boolean
  contentError: Error | null
}

/**
 * 文档编辑回退态事件。
 */
export interface DocsDocumentEditorFallbackEmits {
  createDocument: []
  openFallbackDocument: []
  retryLoad: []
}

/**
 * 文档历史条目。
 */
export interface DocumentHistoryEntry {
  snapshotId: string
  snapshot: DocumentVersionSnapshot
  timeLabel: string
  summary: string | null
  userDisplayName: string
  changeCount: number
  isCurrentSnapshot: boolean
  isCurrentContent: boolean
}

/**
 * 文档历史分组。
 */
export interface DocumentHistoryGroup {
  id: string
  label: string
  entries: DocumentHistoryEntry[]
  collapsible: boolean
  defaultExpanded: boolean
}

/**
 * 文档历史分段。
 */
export interface DocumentHistorySection {
  id: string
  label: string
  groups: DocumentHistoryGroup[]
}
