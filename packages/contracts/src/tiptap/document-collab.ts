import { z } from 'zod'
import { TiptapJsonContentPayloadSchema } from './core'

export const TIPTAP_DOCUMENT_COLLABORATION_FIELD = {
  TITLE: 'title',
  BODY: 'body',
} as const

export const TIPTAP_DOCUMENT_COLLABORATION_FIELD_VALUES = [
  TIPTAP_DOCUMENT_COLLABORATION_FIELD.TITLE,
  TIPTAP_DOCUMENT_COLLABORATION_FIELD.BODY,
] as const

export const TiptapDocumentCollaborationFieldSchema = z.enum(TIPTAP_DOCUMENT_COLLABORATION_FIELD_VALUES)

export const TiptapDocumentCollaborationContentProjectionSchema = z.object({
  title: TiptapJsonContentPayloadSchema,
  body: TiptapJsonContentPayloadSchema,
}).strict()

export type TiptapDocumentCollaborationField = z.infer<typeof TiptapDocumentCollaborationFieldSchema>
export type TiptapDocumentCollaborationContentProjection = z.infer<typeof TiptapDocumentCollaborationContentProjectionSchema>
