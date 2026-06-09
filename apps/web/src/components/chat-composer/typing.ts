import type { AiModelRef } from '@/apis/ai'
import type {
  ChatDocumentScope,
  ChatMessageAttachmentInput,
  ChatMessageContentJSON,
} from '@/apis/chat'

export type ChatComposerContentJSON = ChatMessageContentJSON
export type ChatComposerAttachment = ChatMessageAttachmentInput
export type ChatComposerModelRef = Pick<AiModelRef, 'providerId' | 'modelId'> & Partial<Pick<AiModelRef, 'scope' | 'providerKey'>>
export type ChatComposerModelSelectionKind = 'default' | 'draft' | 'override'

export interface ChatComposerSubmitPayload {
  content: string
  contentJSON: ChatComposerContentJSON
  attachments: ChatComposerAttachment[]
}

export interface ChatComposerProps {
  contentJSON: ChatComposerContentJSON
  attachments: ChatComposerAttachment[]
  selectedModelRef?: ChatComposerModelRef | null
  modelSelectionKind?: ChatComposerModelSelectionKind
  isStreaming?: boolean
  disabled?: boolean
  inputTokenEstimate?: number
  highlightAttachmentId?: string | null
  documentPickerTeleportTo?: string
}

export interface ChatComposerEmits {
  'update:contentJSON': [contentJSON: ChatComposerContentJSON]
  'update:attachments': [attachments: ChatComposerAttachment[]]
  'send': [payload: ChatComposerSubmitPayload]
  'stop': []
  'selectModel': [modelRef: ChatComposerModelRef | null]
  'placeholderUpload': []
  'placeholderCommand': []
  'highlightAttachment': [attachmentId: string]
}

export interface ChatComposerExposed {
  focus: () => void
}

export interface ChatComposerSerializedContent {
  content: string
  bodyTextWithoutReferences: string
  inlineAttachmentIds: string[]
}

export interface ChatReferenceAttrs {
  id: string
  attachmentId: string
  label: string
}

export interface ChatDocumentSelectionBoundary {
  blockId: string
  offset: number
}

export interface ChatComposerDocumentSelectionScope {
  kind: 'selection'
  field: 'body'
  blockIds: string[]
  from: ChatDocumentSelectionBoundary
  to: ChatDocumentSelectionBoundary
}

export type ChatComposerDocumentScope = ChatDocumentScope
