import type { PublicationSidebarPage } from '@haohaoxue/samepage-contracts'

export interface PublicationSidebarPageNodeProps {
  activeDocumentId: string | null
  page: PublicationSidebarPage
  siteId: string
}
