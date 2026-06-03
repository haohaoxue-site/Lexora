import { z } from 'zod'
import { TIPTAP_DOCUMENT_COLLABORATION_FIELD_VALUES } from './constants'
import { TiptapJsonContentPayloadSchema } from './core'

export {
  TIPTAP_DOCUMENT_COLLABORATION_FIELD,
  TIPTAP_DOCUMENT_COLLABORATION_FIELD_VALUES,
} from './constants'

export const TiptapDocumentCollaborationFieldSchema = z.enum(TIPTAP_DOCUMENT_COLLABORATION_FIELD_VALUES)

export const TiptapDocumentCollaborationContentProjectionSchema = z.object({
  title: TiptapJsonContentPayloadSchema,
  body: TiptapJsonContentPayloadSchema,
}).strict()

export type TiptapDocumentCollaborationField = z.infer<typeof TiptapDocumentCollaborationFieldSchema>
export type TiptapDocumentCollaborationContentProjection = z.infer<typeof TiptapDocumentCollaborationContentProjectionSchema>
