import type { DocumentShareAccess, TiptapJsonContent } from '@haohaoxue/samepage-contracts'

/**
 * 分享阅读页主区状态。
 */
export type SharedDocsSurfaceState = 'loading' | 'confirm' | 'reader' | 'invalid' | 'error'

/**
 * 分享阅读文档。
 */
export interface SharedDocumentReaderDocument {
  /** 文档 ID */
  id: string
  /** 文档标题 */
  title: TiptapJsonContent
  /** 文档正文 */
  body: TiptapJsonContent
}

/**
 * 分享确认页属性。
 */
export interface SharedDocumentAccessPageProps {
  access: DocumentShareAccess
  isActionPending: boolean
}

/**
 * 分享确认页事件。
 */
export interface SharedDocumentAccessPageEmits {
  accept: []
  decline: []
}

/**
 * 分享阅读页属性。
 */
export interface SharedDocumentReaderPageProps {
  document: SharedDocumentReaderDocument
  activeBlockId?: string | null
  access?: DocumentShareAccess | null
  isActionPending?: boolean
}
