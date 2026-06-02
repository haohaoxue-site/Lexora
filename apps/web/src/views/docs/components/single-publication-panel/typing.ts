import type {
  DocumentSinglePublicationScope,
  DocumentSinglePublicationState,
  DocumentSinglePublicationTreeItem,
  PublicationPage,
  PublicationSitePageScope,
} from '@/apis/document-publication'

export interface SinglePublicationPanelProps {
  tree: DocumentSinglePublicationTreeItem[]
  sitePages: PublicationPage[]
  loading?: boolean
  updatingDocumentId?: string | null
}

export interface SinglePublicationPanelEmits {
  refresh: []
  removeSitePage: [pageId: string]
  updateState: [documentId: string, state: DocumentSinglePublicationState, scope?: DocumentSinglePublicationScope]
}

export type SinglePublicationStateType = 'success' | 'primary' | 'warning' | 'info'
export type PublicationSiteCollectionState = 'none' | 'direct' | 'inherited' | 'hidden'

export interface PublicationSiteCollectionInfo {
  state: PublicationSiteCollectionState
  label: string
  type: SinglePublicationStateType
  scope: PublicationSitePageScope | null
  pageId: string | null
}
