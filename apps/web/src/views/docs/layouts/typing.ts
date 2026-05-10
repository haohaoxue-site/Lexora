import type {
  DocumentPaneState,
  DocumentShareProjection,
  DocumentTreeCollectionId,
  DocumentTreeGroup,
  DocumentVersionSnapshot,
  TiptapJsonContent,
  WorkspaceType,
} from '@haohaoxue/samepage-contracts'
import type {
  ActiveDocumentDetail,
  DocsDocumentCollaborationStatusTone,
  DocsDocumentEditorCollaborationBindings,
  DocsDocumentEditorMode,
  DocsSurfaceView,
} from '../typing'
import type { TiptapEditorCommentRequest } from '@/components/tiptap-editor'

/**
 * 文档上下文栏属性。
 */
export interface DocsContextBarLayoutProps {
  /** 是否为文档编辑主区 */
  isDocumentSurface: boolean
  /** 当前主区视图 */
  currentSurface: DocsSurfaceView
  /** 当前文档面包屑 */
  visibleBreadcrumbLabels: string[]
  /** 协作状态文案 */
  collaborationStatusLabel?: string | null
  /** 协作状态视觉类型 */
  collaborationStatusTone?: DocsDocumentCollaborationStatusTone | null
  /** 协作状态提示 */
  collaborationStatusHint?: string | null
  /** 是否允许手动重连协作 */
  canReconnectCollaboration?: boolean
  /** 当前文档 ID */
  documentId: string
  /** 当前文档分享投影 */
  documentShare: DocumentShareProjection | null
  /** 是否允许打开分享弹窗 */
  canOpenShareDialog: boolean
}

/**
 * 文档上下文栏事件。
 */
export interface DocsContextBarLayoutEmits {
  reconnectCollaboration: []
  openShare: [documentId: string]
}

/**
 * 文档侧边栏属性。
 */
export interface DocsSidebarLayoutProps {
  /** 文档树分组 */
  treeGroups: DocumentTreeGroup[]
  /** 当前空间类型 */
  currentWorkspaceType: WorkspaceType
  /** 当前选中文档 ID */
  activeDocumentId: string | null
  /** 已展开的文档 ID */
  expandedDocumentIds: Set<string>
  /** 已折叠的分组 ID */
  collapsedGroupIds: Set<DocumentTreeCollectionId>
  /** 是否正在加载文档树 */
  isDocumentLoading: boolean
  /** 是否正在变更文档树 */
  isMutatingTree: boolean
  /** 当前主区视图 */
  currentSurface: DocsSurfaceView
  /** 待接收分享数量 */
  pendingShareCount: number
  /** 是否存在待接收分享 */
  hasPendingShares: boolean
  /** 是否允许打开分享弹窗 */
  canOpenShareDialog: boolean
}

/**
 * 文档侧边栏事件。
 */
export interface DocsSidebarLayoutEmits {
  openDocument: [documentId: string]
  toggleDocument: [documentId: string]
  toggleGroupCollapse: [collectionId: DocumentTreeCollectionId]
  createRootDocument: [collectionId: DocumentTreeCollectionId]
  createChildDocument: [documentId: string]
  openHistory: [documentId: string]
  moveDocumentToTeam: [documentId: string]
  shareDocument: [documentId: string]
  deleteDocument: [documentId: string]
  openPendingShares: []
  openPermissionsOverview: []
  openTrashPage: []
}

/**
 * 文档普通主区布局属性。
 */
export interface DocsActiveSurfaceLayoutProps extends DocsSidebarLayoutProps {
  /** 路由页是否为文档编辑页 */
  isDocumentSurface: boolean
  /** 当前预览文档 */
  previewDocument: ActiveDocumentDetail | null
  /** 是否应自动聚焦标题 */
  autofocusTitle?: boolean
  /** 当前协作绑定 */
  docsDocumentEditorCollaboration?: DocsDocumentEditorCollaborationBindings | null
  /** 文档编辑模式 */
  docsDocumentEditorMode: DocsDocumentEditorMode
  /** 是否允许编辑 */
  isDocsDocumentEditable: boolean
  /** 当前 URL 对应的块 ID */
  activeBlockId?: string | null
  /** 是否正在加载当前文档 */
  isDocumentItemLoading: boolean
  /** 文档面板状态 */
  documentPaneState: DocumentPaneState
  /** 是否存在回退文档 */
  hasFallbackDocument: boolean
}

/**
 * 文档普通主区布局事件。
 */
export interface DocsActiveSurfaceLayoutEmits {
  openDocument: [documentId: string]
  toggleDocument: [documentId: string]
  toggleGroupCollapse: [collectionId: DocumentTreeCollectionId]
  createRootDocument: [collectionId: DocumentTreeCollectionId]
  createChildDocument: [documentId: string]
  openHistory: [documentId: string]
  moveDocumentToTeam: [documentId: string]
  deleteDocument: [documentId: string]
  openPendingShares: []
  openPermissionsOverview: []
  openTrashPage: []
  openShare: [documentId: string]
  updateTitle: [title: TiptapJsonContent]
  updateContent: [content: TiptapJsonContent]
  requestComment: [request: TiptapEditorCommentRequest]
  titleAutofocusApplied: []
  createDocument: []
  openFallbackDocument: []
  retryLoad: []
}

/**
 * 文档历史布局属性。
 */
export interface DocsHistoryLayoutProps {
  /** 当前预览文档 */
  previewDocument: ActiveDocumentDetail | null
  /** 当前正式文档 */
  currentDocument: ActiveDocumentDetail | null
  /** 文档快照列表 */
  snapshots: DocumentVersionSnapshot[]
  /** 文档编辑模式 */
  docsDocumentEditorMode: DocsDocumentEditorMode
  /** 是否允许编辑 */
  isDocsDocumentEditable: boolean
  /** 当前 URL 对应的块 ID */
  activeBlockId?: string | null
  /** 是否正在加载当前文档 */
  isDocumentItemLoading: boolean
  /** 是否正在加载历史快照 */
  isSnapshotsLoading: boolean
  /** 是否正在还原快照 */
  isRestoringSnapshot: boolean
  /** 当前选中的历史快照 ID */
  selectedSnapshotId: string | null
  /** 是否允许还原当前快照 */
  canRestoreSelectedSnapshot: boolean
  /** 文档面板状态 */
  documentPaneState: DocumentPaneState
  /** 是否存在回退文档 */
  hasFallbackDocument: boolean
}

/**
 * 文档历史布局事件。
 */
export interface DocsHistoryLayoutEmits {
  closeHistoryMode: []
  restoreSelectedSnapshot: []
  selectHistorySnapshot: [snapshotId: string]
  updateTitle: [title: TiptapJsonContent]
  updateContent: [content: TiptapJsonContent]
  requestComment: [request: TiptapEditorCommentRequest]
  createDocument: []
  openFallbackDocument: []
  retryLoad: []
}
