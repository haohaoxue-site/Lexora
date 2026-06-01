import type {
  CreatePublicationPageRequest,
  UpdatePublicationPageRequest,
  UpdatePublicationSectionRequest,
  UpsertPublicationSiteSettingsRequest,
} from '@/apis/document-publication'

export type PublicationManagementTab = 'single' | 'site-settings' | 'site-content' | 'site-nav'
export type SiteSettingsDraft = Omit<UpsertPublicationSiteSettingsRequest, 'workspaceId'>
export type CreatePageDraft = Omit<CreatePublicationPageRequest, 'workspaceId'>
export type UpdateSectionDraft = Omit<UpdatePublicationSectionRequest, 'workspaceId'>
export type UpdatePageDraft = Omit<UpdatePublicationPageRequest, 'workspaceId'>
