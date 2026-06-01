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
  updateState: [documentId: string, state: DocumentSinglePublicationState, scope?: DocumentSinglePublicationScope]
}

export type SinglePublicationStateType = 'success' | 'primary' | 'warning' | 'info'
export type PublicationSiteScopeByDocumentId = Map<string, PublicationSitePageScope>
