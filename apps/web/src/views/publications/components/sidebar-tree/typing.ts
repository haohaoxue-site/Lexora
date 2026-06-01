import type { PublicationSidebarGroup } from '@haohaoxue/samepage-contracts'

export interface PublicationSidebarTreeProps {
  activeDocumentId: string | null
  groups: PublicationSidebarGroup[]
  siteId: string
}
