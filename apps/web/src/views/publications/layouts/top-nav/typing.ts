import type { PublicationSiteMeta } from '@haohaoxue/samepage-contracts'
import type { ResolvedPublicationNavItem } from '../../utils/publicationRendering'

export interface PublicationTopNavProps {
  home?: boolean
  navItems: ResolvedPublicationNavItem[]
  site: PublicationSiteMeta
}
