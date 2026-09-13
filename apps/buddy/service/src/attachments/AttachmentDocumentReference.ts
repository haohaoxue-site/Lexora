import type { BuddyDocumentMimeType } from '../../../shared/conversation/attachmentFormats'

export interface AttachmentDocumentReference {
  attachmentId: string
  mimeType: BuddyDocumentMimeType
}

export interface AttachmentFileInput {
  data: string
  name: string
  mimeType: BuddyDocumentMimeType
}
