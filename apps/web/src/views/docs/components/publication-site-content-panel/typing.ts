import type {
  CreatePublicationPageRequest,
  DocumentSinglePublicationTreeItem,
  PublicationPage,
  PublicationSection,
  PublicationSitePageScope,
  UpdatePublicationPageRequest,
  UpdatePublicationSectionRequest,
} from '@/apis/document-publication'

export type CreatePageDraft = Omit<CreatePublicationPageRequest, 'workspaceId'>
export type UpdateSectionDraft = Omit<UpdatePublicationSectionRequest, 'workspaceId'>
export type UpdatePageDraft = Omit<UpdatePublicationPageRequest, 'workspaceId'>

export interface PublicationSiteContentPanelProps {
  tree: DocumentSinglePublicationTreeItem[]
  sections: PublicationSection[]
  pages: PublicationPage[]
  loading?: boolean
  mutating?: boolean
}

export interface PublicationSiteContentPanelEmits {
  createPage: [payload: CreatePageDraft]
  createSection: [title: string]
  removePage: [pageId: string]
  removeSection: [sectionId: string]
  updatePage: [pageId: string, payload: UpdatePageDraft]
  updateSection: [sectionId: string, payload: UpdateSectionDraft]
}

export interface DocumentSelectNode {
  value: string
  label: string
  disabled: boolean
  children: DocumentSelectNode[]
}

export interface FlatDocumentItem {
  id: string
  title: string
  depth: number
}

export interface PublicationPageForm {
  sectionId: string
  documentId: string
  title: string
  scope: PublicationSitePageScope
  order: number
}
