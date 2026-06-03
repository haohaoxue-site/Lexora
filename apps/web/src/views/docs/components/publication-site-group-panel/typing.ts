import type {
  CreatePublicationPageRequest,
  DocumentSinglePublicationTreeItem,
  PublicationPage,
  PublicationSection,
  PublicationSitePageScope,
  UpdatePublicationSectionRequest,
} from '@/apis/document-publication'

export type CreatePageDraft = Omit<CreatePublicationPageRequest, 'workspaceId'>
export type UpdateGroupDraft = Omit<UpdatePublicationSectionRequest, 'workspaceId'>

export interface PublicationSiteGroupPanelProps {
  tree: DocumentSinglePublicationTreeItem[]
  groups: PublicationSection[]
  pages: PublicationPage[]
  loading?: boolean
  mutating?: boolean
}

export interface PublicationSiteGroupPanelEmits {
  createPage: [payload: CreatePageDraft]
  createGroup: [title: string]
  removeGroup: [groupId: string]
  reorderPages: [orders: PublicationSitePageOrderDraft[]]
  updateGroup: [groupId: string, payload: UpdateGroupDraft, options?: PublicationSiteGroupMutationOptions]
}

export interface PublicationSiteGroupMutationOptions {
  silent?: boolean
}

export interface PublicationSitePageOrderDraft {
  pageId: string
  order: number
}

export interface DocumentSelectNode {
  value: string
  label: string
  disabled: boolean
  children: DocumentSelectNode[]
}

export interface PublicationPageForm {
  sectionId: string
  documentId: string
  title: string
  scope: PublicationSitePageScope
  order: number
}
