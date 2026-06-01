import type {
  DocumentSinglePublicationTreeItem,
  PublicationSite,
  PublicationSiteHomeConfig,
  UpsertPublicationSiteSettingsRequest,
} from '@/apis/document-publication'

export type SiteSettingsDraft = Omit<UpsertPublicationSiteSettingsRequest, 'workspaceId'>

export interface PublicationSiteSettingsPanelProps {
  site: PublicationSite | null
  tree: DocumentSinglePublicationTreeItem[]
  loading?: boolean
  saving?: boolean
}

export interface PublicationSiteSettingsPanelEmits {
  save: [payload: SiteSettingsDraft]
}

export interface DocumentSelectNode {
  value: string
  label: string
  children: DocumentSelectNode[]
}

export interface SiteSettingsForm {
  title: string
  description: string
  logoUrl: string
  theme: string
  homeMode: string
  homeDocumentId: string
  allowIndexing: boolean
  heroName: string
  heroText: string
  heroTagline: string
  heroImageUrl: string
  footerMessage: string
  footerCopyright: string
}

export type SiteHomeConfigDraft = PublicationSiteHomeConfig
