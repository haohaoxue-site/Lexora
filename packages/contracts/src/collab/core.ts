import { z } from 'zod'
import { UserAccountIdentitySchema } from '../identity'
import { YdocRuntimeEpochSchema } from '../ydoc/runtime'

export const COLLAB_RUNTIME_ROLE = {
  EDITOR: 'EDITOR',
} as const

export const COLLAB_RUNTIME_ROLE_VALUES = [COLLAB_RUNTIME_ROLE.EDITOR] as const

export const COLLAB_ERROR_CODE = {
  TICKET_INVALID: 'ticket-invalid',
  TICKET_EXPIRED: 'ticket-expired',
  TICKET_REPLAYED: 'ticket-replayed',
  RATE_LIMITED: 'rate-limited',
  CONNECTION_LIMIT_EXCEEDED: 'connection-limit-exceeded',
  DOCUMENT_MISMATCH: 'document-mismatch',
  ENTRY_MISMATCH: 'entry-mismatch',
  RUNTIME_EPOCH_EXPIRED: 'runtime-epoch-expired',
  PERMISSION_INVALIDATED: 'permission-invalidated',
  READONLY_WRITE_REJECTED: 'readonly-write-rejected',
  UPDATE_TOO_LARGE: 'update-too-large',
  UPDATE_SEQUENCE_GAP: 'update-sequence-gap',
  UPDATE_CHECKPOINTED: 'update-checkpointed',
  CHECKPOINT_EXPIRED: 'checkpoint-expired',
  PERSISTENCE_FAILED: 'persistence-failed',
} as const

export const COLLAB_ERROR_CODE_VALUES = [
  COLLAB_ERROR_CODE.TICKET_INVALID,
  COLLAB_ERROR_CODE.TICKET_EXPIRED,
  COLLAB_ERROR_CODE.TICKET_REPLAYED,
  COLLAB_ERROR_CODE.RATE_LIMITED,
  COLLAB_ERROR_CODE.CONNECTION_LIMIT_EXCEEDED,
  COLLAB_ERROR_CODE.DOCUMENT_MISMATCH,
  COLLAB_ERROR_CODE.ENTRY_MISMATCH,
  COLLAB_ERROR_CODE.RUNTIME_EPOCH_EXPIRED,
  COLLAB_ERROR_CODE.PERMISSION_INVALIDATED,
  COLLAB_ERROR_CODE.READONLY_WRITE_REJECTED,
  COLLAB_ERROR_CODE.UPDATE_TOO_LARGE,
  COLLAB_ERROR_CODE.UPDATE_SEQUENCE_GAP,
  COLLAB_ERROR_CODE.UPDATE_CHECKPOINTED,
  COLLAB_ERROR_CODE.CHECKPOINT_EXPIRED,
  COLLAB_ERROR_CODE.PERSISTENCE_FAILED,
] as const

export const COLLAB_PERMISSION_INVALIDATION_REASON = {
  DOCUMENT_TRASHED: 'document-trashed',
  DOCUMENT_MOVED: 'document-moved',
  SHARE_REVOKED: 'share-revoked',
  MEMBER_REMOVED: 'member-removed',
  RUNTIME_EPOCH_EXPIRED: 'runtime-epoch-expired',
} as const

export const COLLAB_PERMISSION_INVALIDATION_REASON_VALUES = [
  COLLAB_PERMISSION_INVALIDATION_REASON.DOCUMENT_TRASHED,
  COLLAB_PERMISSION_INVALIDATION_REASON.DOCUMENT_MOVED,
  COLLAB_PERMISSION_INVALIDATION_REASON.SHARE_REVOKED,
  COLLAB_PERMISSION_INVALIDATION_REASON.MEMBER_REMOVED,
  COLLAB_PERMISSION_INVALIDATION_REASON.RUNTIME_EPOCH_EXPIRED,
] as const

export const COLLAB_PUBSUB_MESSAGE_TYPE = {
  PERMISSION_INVALIDATION: 'permission-invalidation',
} as const

export const COLLAB_PUBSUB_MESSAGE_TYPE_VALUES = [
  COLLAB_PUBSUB_MESSAGE_TYPE.PERMISSION_INVALIDATION,
] as const

export const COLLAB_REDIS_CHANNEL = {
  PERMISSION_INVALIDATION: 'samepage:collab:permission-invalidation',
} as const

export const DOCUMENT_COLLAB_STATELESS_MESSAGE_TYPE = {
  SAVE_REQUEST: 'document.save.request',
  SAVE_RESULT: 'document.save.result',
} as const

export const DOCUMENT_COLLAB_STATELESS_MESSAGE_TYPE_VALUES = [
  DOCUMENT_COLLAB_STATELESS_MESSAGE_TYPE.SAVE_REQUEST,
  DOCUMENT_COLLAB_STATELESS_MESSAGE_TYPE.SAVE_RESULT,
] as const

export const CollabErrorCodeSchema = z.enum(COLLAB_ERROR_CODE_VALUES)
export const CollabPermissionInvalidationReasonSchema = z.enum(COLLAB_PERMISSION_INVALIDATION_REASON_VALUES)
export const CollabPubSubMessageTypeSchema = z.enum(COLLAB_PUBSUB_MESSAGE_TYPE_VALUES)
export const CollabRuntimeRoleSchema = z.enum(COLLAB_RUNTIME_ROLE_VALUES)
export const DocumentCollabStatelessMessageTypeSchema = z.enum(DOCUMENT_COLLAB_STATELESS_MESSAGE_TYPE_VALUES)

export const CollabAwarenessUserSchema = UserAccountIdentitySchema.pick({
  id: true,
  displayName: true,
  avatarUrl: true,
})

export const CollabAwarenessStateSchema = z.object({
  user: CollabAwarenessUserSchema,
}).strict()

export const CollabTicketPayloadSchema = z.object({
  jti: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  documentId: z.string().trim().min(1),
  workspaceId: z.string().trim().min(1),
  runtimeRole: CollabRuntimeRoleSchema,
  canWrite: z.boolean(),
  runtimeEpoch: YdocRuntimeEpochSchema,
  expiresAt: z.string().datetime(),
}).strict()

export const CreateCollabTicketResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.string().datetime(),
  runtimeEpoch: YdocRuntimeEpochSchema,
  publicWsUrl: z.string(),
}).strict()

export const ConsumeCollabTicketRequestSchema = z.object({
  token: z.string().trim().min(1),
}).strict()

export const ConsumeCollabTicketResponseSchema = CollabTicketPayloadSchema

export const CollabPermissionInvalidationRequestSchema = z.object({
  reason: CollabPermissionInvalidationReasonSchema,
  documentId: z.string().trim().min(1).optional(),
  workspaceId: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1).optional(),
  entryShareId: z.string().trim().min(1).nullable().optional(),
  entryRecipientId: z.string().trim().min(1).nullable().optional(),
  runtimeEpoch: YdocRuntimeEpochSchema.optional(),
}).strict().refine(input => Boolean(
  input.documentId
  || input.workspaceId
  || input.userId
  || input.entryShareId
  || input.entryRecipientId
  || input.runtimeEpoch,
), {
  message: '至少需要一个权限失效匹配条件',
})

export const CollabPermissionInvalidationResponseSchema = z.object({
  disconnected: z.number().int().nonnegative(),
}).strict()

export const CollabPermissionInvalidationPubSubMessageSchema = z.object({
  type: z.literal(COLLAB_PUBSUB_MESSAGE_TYPE.PERMISSION_INVALIDATION),
  invalidation: CollabPermissionInvalidationRequestSchema,
}).strict()

export const CollabPubSubMessageSchema = z.discriminatedUnion('type', [
  CollabPermissionInvalidationPubSubMessageSchema,
])

export const DocumentCollabStatelessSaveRequestPayloadSchema = z.object({
  type: z.literal(DOCUMENT_COLLAB_STATELESS_MESSAGE_TYPE.SAVE_REQUEST),
  requestId: z.string().trim().min(1),
}).strict()

export const DocumentCollabStatelessSaveResultPayloadSchema = z.object({
  type: z.literal(DOCUMENT_COLLAB_STATELESS_MESSAGE_TYPE.SAVE_RESULT),
  requestId: z.string().trim().min(1),
  ok: z.boolean(),
  savedAt: z.string().datetime().nullable(),
  error: z.string().trim().min(1).nullable(),
}).strict()

export const DocumentCollabStatelessMessagePayloadSchema = z.discriminatedUnion('type', [
  DocumentCollabStatelessSaveRequestPayloadSchema,
  DocumentCollabStatelessSaveResultPayloadSchema,
])

export type CollabAwarenessUser = z.infer<typeof CollabAwarenessUserSchema>
export type CollabAwarenessState = z.infer<typeof CollabAwarenessStateSchema>
export type CollabErrorCode = z.infer<typeof CollabErrorCodeSchema>
export type CollabPermissionInvalidationPubSubMessage = z.infer<typeof CollabPermissionInvalidationPubSubMessageSchema>
export type CollabPermissionInvalidationReason = z.infer<typeof CollabPermissionInvalidationReasonSchema>
export type CollabPermissionInvalidationRequest = z.infer<typeof CollabPermissionInvalidationRequestSchema>
export type CollabPermissionInvalidationResponse = z.infer<typeof CollabPermissionInvalidationResponseSchema>
export type CollabPubSubMessage = z.infer<typeof CollabPubSubMessageSchema>
export type CollabPubSubMessageType = z.infer<typeof CollabPubSubMessageTypeSchema>
export type CollabRuntimeRole = z.infer<typeof CollabRuntimeRoleSchema>
export type CollabTicketPayload = z.infer<typeof CollabTicketPayloadSchema>
export type ConsumeCollabTicketRequest = z.infer<typeof ConsumeCollabTicketRequestSchema>
export type ConsumeCollabTicketResponse = z.infer<typeof ConsumeCollabTicketResponseSchema>
export type CreateCollabTicketResponse = z.infer<typeof CreateCollabTicketResponseSchema>
export type DocumentCollabStatelessMessagePayload = z.infer<typeof DocumentCollabStatelessMessagePayloadSchema>
export type DocumentCollabStatelessMessageType = z.infer<typeof DocumentCollabStatelessMessageTypeSchema>
export type DocumentCollabStatelessSaveRequestPayload = z.infer<typeof DocumentCollabStatelessSaveRequestPayloadSchema>
export type DocumentCollabStatelessSaveResultPayload = z.infer<typeof DocumentCollabStatelessSaveResultPayloadSchema>
