import type { TiptapJsonMarkPayload, TiptapJsonNodePayload } from './_typing'
import { z } from 'zod'

export const TIPTAP_SCHEMA_VERSION = 1 as const

const TiptapJsonMarkPayloadSchema = z.object({
  type: z.string(),
  attrs: z.record(z.string(), z.unknown()).optional(),
}).catchall(z.unknown()) satisfies z.ZodType<TiptapJsonMarkPayload>

const TiptapJsonNodePayloadSchema: z.ZodType<TiptapJsonNodePayload> = z.lazy(() =>
  z.object({
    type: z.string().optional(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    text: z.string().optional(),
    content: z.array(TiptapJsonNodePayloadSchema).optional(),
    marks: z.array(TiptapJsonMarkPayloadSchema).optional(),
  }).catchall(z.unknown()),
)

export const TiptapSchemaVersionSchema = z.literal(TIPTAP_SCHEMA_VERSION)
export const TiptapJsonContentPayloadSchema = z.array(TiptapJsonNodePayloadSchema)

export type TiptapJsonContent = z.infer<typeof TiptapJsonContentPayloadSchema>
export type TiptapJsonNode = TiptapJsonContent[number]
export type TiptapSchemaVersion = z.infer<typeof TiptapSchemaVersionSchema>
