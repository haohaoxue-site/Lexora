import type {
  DocumentItem,
  DocumentPaneState,
  DocumentRecord,
  DocumentRevision,
  DocumentShareProjection,
  DocumentShareRecipientSummary,
  DocumentTreeCollectionId,
  DocumentTreeGroup,
  DocumentVersionSnapshot,
  TiptapJsonContent,
  TiptapSchemaVersion,
  WorkspaceType,
} from '@haohaoxue/samepage-contracts'
import type {
  TiptapEditorCollaborationBinding,
  TiptapEditorCommentRequest,
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
export type DocsSurfaceView = 'document' | 'permissions' | 'trash' | 'pending-shares'

/**
 * 分享收件箱模式。
 */
export type DocumentShareInboxMode = 'pending' | 'active'

/**
 * 文档分享变更事件。
 */
export interface DocumentShareChangedPayload {
  /** 文档 ID */
  documentId: string
  /** 最新分享投影 */
  share: DocumentShareProjection | null
}

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
 * 文档历史面板属性。
 */
export interface DocumentHistoryPanelProps {
  document: ActiveDocumentDetail | null
  snapshots: DocumentVersionSnapshot[]
  selectedSnapshotId: string | null
  isLoading: boolean
}

/**
 * 文档历史面板事件。
 */
export interface DocumentHistoryPanelEmits {
  select: [snapshotId: string]
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

/**
 * 文档树工具栏属性。
 */
export interface DocumentToolbarProps {
  isBusy: boolean
  collectionId: DocumentTreeCollectionId
}

/**
 * 文档树工具栏事件。
 */
export interface DocumentToolbarEmits {
  createRoot: [collectionId: DocumentTreeCollectionId]
}

/**
 * 文档分组面板属性。
 */
export interface DocumentSectionPanelProps {
  group: DocumentTreeGroup
  currentWorkspaceType: WorkspaceType
  activeDocumentId: string | null
  expandedDocumentIds: Set<string>
  isCollapsed: boolean
  isActionPending: boolean
  canShareDocument: boolean
  canCreateRoot?: boolean
}

/**
 * 文档分组面板事件。
 */
export interface DocumentSectionPanelEmits {
  open: [documentId: string]
  toggle: [documentId: string]
  toggleCollapse: [collectionId: DocumentTreeCollectionId]
  createRoot: [collectionId: DocumentTreeCollectionId]
  createChild: [documentId: string]
  openHistory: [documentId: string]
  moveDocumentToTeam: [documentId: string]
  shareDocument: [documentId: string]
  deleteDocument: [documentId: string]
}

/**
 * 文档树条目属性。
 */
export interface DocumentItemProps {
  item: DocumentItem
  collectionId: DocumentTreeCollectionId
  currentWorkspaceType: WorkspaceType
  depth: number
  activeDocumentId: string | null
  expandedDocumentIds: Set<string>
  isActionPending: boolean
  canShareDocument: boolean
}

/**
 * 文档树条目事件。
 */
export interface DocumentItemEmits {
  open: [documentId: string]
  toggle: [documentId: string]
  createChild: [documentId: string]
  openHistory: [documentId: string]
  moveDocumentToTeam: [documentId: string]
  shareDocument: [documentId: string]
  deleteDocument: [documentId: string]
}

/**
 * 分享收件箱列表属性。
 */
export interface DocumentShareInboxListProps {
  mode: DocumentShareInboxMode
  items: DocumentShareRecipientSummary[]
  isLoading: boolean
  errorMessage: string
  actionRecipientId: string
}

/**
 * 分享收件箱列表事件。
 */
export interface DocumentShareInboxListEmits {
  reload: []
  open: [recipientId: string]
  accept: [recipientId: string]
  decline: [recipientId: string]
  exit: [recipientId: string]
}
