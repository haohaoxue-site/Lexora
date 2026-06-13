import type {
  PublicationPageOutlineItem,
  PublicationRenderedDocument,
  PublicationSidebarGroup,
  TiptapJsonContent,
} from '@haohaoxue/lexora-contracts'

export interface PublicationSiteDocumentPageProps {
  body: TiptapJsonContent
  document: PublicationRenderedDocument
  outline: PublicationPageOutlineItem[]
  sidebarGroups: PublicationSidebarGroup[]
  siteId: string
}
