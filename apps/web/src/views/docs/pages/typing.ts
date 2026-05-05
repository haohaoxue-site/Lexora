import type {
  DocumentShareProjection,
  DocumentTreeGroup,
} from '@haohaoxue/samepage-contracts'
import type {
  DocsDocumentEditorPaneEmits,
  DocsDocumentEditorPaneProps,
} from '../typing'

export type {
  DocumentShareProjection,
  DocumentTreeGroup,
}

/**
 * 文档主编辑页属性。
 */
export type DocsDocumentSurfacePageProps = DocsDocumentEditorPaneProps

/**
 * 文档主编辑页事件。
 */
export type DocsDocumentSurfacePageEmits = DocsDocumentEditorPaneEmits

/**
 * 待接收分享页属性。
 */
export type DocsPendingSharesPageProps = Record<string, never>

/**
 * 待接收分享页事件。
 */
export type DocsPendingSharesPageEmits = Record<string, never>

/**
 * 权限管理页属性。
 */
export interface DocsPermissionsPageProps {
  /** 文档树分组 */
  treeGroups?: DocumentTreeGroup[]
  /** 是否正在加载 */
  isLoading?: boolean
}

/**
 * 权限管理页事件。
 */
export interface DocsPermissionsPageEmits {
  openShare: [documentId: string]
}

/**
 * 权限总览条目。
 */
export interface PermissionOverviewItem {
  /** 文档 ID */
  documentId: string
  /** 文档标题 */
  title: string
  /** 分组名称 */
  collectionLabel: string
  /** 所在位置 */
  locationLabel: string
  /** 分享摘要 */
  modeLabel: string
  /** 最近更新时间 */
  updatedAt: string
  /** 分享投影 */
  share: DocumentShareProjection
}

/**
 * 回收站页属性。
 */
export type DocsTrashPageProps = Record<string, never>

/**
 * 回收站页事件。
 */
export type DocsTrashPageEmits = Record<string, never>
