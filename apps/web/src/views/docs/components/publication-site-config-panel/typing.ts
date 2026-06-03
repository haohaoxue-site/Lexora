import type {
  PublicationSite,
  PublicationSiteHomeConfig,
  PublicationSiteMediaKind,
  UpsertPublicationSiteSettingsRequest,
} from '@/apis/document-publication'

export type SiteConfigDraft = Omit<UpsertPublicationSiteSettingsRequest, 'workspaceId'>

export interface PublicationSiteConfigPanelProps {
  site: PublicationSite | null
  loading?: boolean
  saving?: boolean
  uploadingMediaKind?: PublicationSiteMediaKind | null
}

export interface PublicationSiteConfigPanelEmits {
  save: [payload: SiteConfigDraft]
  uploadMedia: [kind: PublicationSiteMediaKind, file: File]
  removeMedia: [kind: PublicationSiteMediaKind]
}

export interface SiteConfigForm {
  title: string
  logoUrl: string
  siteAccessEnabled: boolean
  heroName: string
  heroText: string
  heroTagline: string
  heroImageUrl: string
  footerMessage: string
  footerCopyright: string
}

export type SiteHomeConfigDraft = PublicationSiteHomeConfig
