import type { PublicationSiteMeta } from '@haohaoxue/samepage-contracts'
import type { ResolvedPublicationNavItem } from '../../utils/publicationRendering'

export interface PublicationTopNavProps {
  navItems: ResolvedPublicationNavItem[]
  site: PublicationSiteMeta
}
