import { z } from 'zod'
import { TiptapJsonContentPayloadSchema, TiptapSchemaVersionSchema } from '../tiptap/core'
import {
  YdocBinaryPayloadSchema,
  YdocFormatVersionSchema,
  YdocRuntimeEpochSchema,
  YdocUpdateSeqSchema,
} from '../ydoc/runtime'
import {
  DocumentCurrentProjectionSchema,
  DocumentRevisionSchema,
} from './core'

export const DocumentYdocCheckpointMetadataSchema = z.object({
  documentId: z.string().trim().min(1),
  ydocFormatVersion: YdocFormatVersionSchema,
  runtimeEpoch: YdocRuntimeEpochSchema,
  checkpointSeq: YdocUpdateSeqSchema,
  checkpointUpdateSeq: YdocUpdateSeqSchema,
  updateSeq: YdocUpdateSeqSchema,
  lastProjectedProjectionId: z.string().nullable(),
  lastProjectedProjectionRevision: DocumentRevisionSchema,
  lastProjectedAt: z.string().nullable(),
  updatedAt: z.string(),
}).strict()

export const DocumentYdocUpdateRecordSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  runtimeEpoch: YdocRuntimeEpochSchema,
  seq: YdocUpdateSeqSchema,
  idempotencyKey: z.string(),
  clientId: z.string().nullable(),
  update: YdocBinaryPayloadSchema,
  createdBy: z.string().nullable(),
  createdAt: z.string(),
}).strict()

export const DocumentYdocRuntimeStateSchema = z.object({
  metadata: DocumentYdocCheckpointMetadataSchema,
  checkpointState: YdocBinaryPayloadSchema.nullable(),
  updates: DocumentYdocUpdateRecordSchema.array(),
}).strict()

export const PersistDocumentYdocUpdateRequestSchema = z.object({
  documentId: z.string().trim().min(1),
  runtimeEpoch: YdocRuntimeEpochSchema,
  seq: YdocUpdateSeqSchema.min(1),
  idempotencyKey: z.string().trim().min(1),
  clientId: z.string().trim().min(1).nullable(),
  update: YdocBinaryPayloadSchema,
  createdBy: z.string().trim().min(1).nullable(),
}).strict()

export const PersistDocumentYdocUpdateResponseSchema = z.object({
  documentId: z.string(),
  runtimeEpoch: YdocRuntimeEpochSchema,
  seq: YdocUpdateSeqSchema,
  duplicate: z.boolean(),
}).strict()

export const MaterializeDocumentYdocCurrentProjectionSchema = z.object({
  runtimeEpoch: YdocRuntimeEpochSchema,
  checkpointSeq: YdocUpdateSeqSchema,
  checkpointUpdateSeq: YdocUpdateSeqSchema,
  schemaVersion: TiptapSchemaVersionSchema,
  title: TiptapJsonContentPayloadSchema,
  body: TiptapJsonContentPayloadSchema,
}).strict()

export const MaterializeDocumentYdocCurrentProjectionResponseSchema = z.object({
  projection: DocumentCurrentProjectionSchema,
  currentProjectionRevision: DocumentRevisionSchema,
}).strict()

export type DocumentYdocCheckpointMetadata = z.infer<typeof DocumentYdocCheckpointMetadataSchema>
export type DocumentYdocUpdateRecord = z.infer<typeof DocumentYdocUpdateRecordSchema>
export type DocumentYdocRuntimeState = z.infer<typeof DocumentYdocRuntimeStateSchema>
export type PersistDocumentYdocUpdateRequest = z.infer<typeof PersistDocumentYdocUpdateRequestSchema>
export type PersistDocumentYdocUpdateResponse = z.infer<typeof PersistDocumentYdocUpdateResponseSchema>
export type MaterializeDocumentYdocCurrentProjectionRequest = z.infer<typeof MaterializeDocumentYdocCurrentProjectionSchema>
export type MaterializeDocumentYdocCurrentProjectionResponse = z.infer<typeof MaterializeDocumentYdocCurrentProjectionResponseSchema>
