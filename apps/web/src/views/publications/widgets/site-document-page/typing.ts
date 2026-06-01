import type {
  PublicationPageOutlineItem,
  PublicationRenderedDocument,
  PublicationSidebarGroup,
  TiptapJsonContent,
} from '@haohaoxue/samepage-contracts'

export interface PublicationSiteDocumentPageProps {
  body: TiptapJsonContent
  document: PublicationRenderedDocument
  outline: PublicationPageOutlineItem[]
  sidebarGroups: PublicationSidebarGroup[]
  siteId: string
}
