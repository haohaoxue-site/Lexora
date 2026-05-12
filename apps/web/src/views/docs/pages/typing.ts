import type { DocumentShareProjection } from '@haohaoxue/samepage-contracts'

export type { DocumentShareProjection }
export type { DocumentTreeGroup } from '@haohaoxue/samepage-contracts'

/**
 * 待接收分享页属性。
 */
export type DocsPendingSharesPageProps = Record<string, never>

/**
 * 待接收分享页事件。
 */
export type DocsPendingSharesPageEmits = Record<string, never>

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
