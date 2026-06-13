import { z } from 'zod'
import { UserAccountIdentitySchema } from '../identity'
import { YdocRuntimeEpochSchema } from '../ydoc/runtime'
import {
  COLLAB_ERROR_CODE_VALUES,
  COLLAB_PERMISSION_INVALIDATION_REASON_VALUES,
  COLLAB_PUBSUB_MESSAGE_TYPE,
  COLLAB_PUBSUB_MESSAGE_TYPE_VALUES,
  COLLAB_RUNTIME_ROLE_VALUES,
  DOCUMENT_COLLAB_STATELESS_MESSAGE_TYPE,
  DOCUMENT_COLLAB_STATELESS_MESSAGE_TYPE_VALUES,
} from './constants'

export {
  COLLAB_ERROR_CODE,
  COLLAB_ERROR_CODE_VALUES,
  COLLAB_PERMISSION_INVALIDATION_REASON,
  COLLAB_PERMISSION_INVALIDATION_REASON_VALUES,
  COLLAB_PUBSUB_MESSAGE_TYPE,
  COLLAB_PUBSUB_MESSAGE_TYPE_VALUES,
  COLLAB_REDIS_CHANNEL,
  COLLAB_RUNTIME_ROLE,
  COLLAB_RUNTIME_ROLE_VALUES,
  DOCUMENT_COLLAB_STATELESS_MESSAGE_TYPE,
  DOCUMENT_COLLAB_STATELESS_MESSAGE_TYPE_VALUES,
} from './constants'

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
  runtimeEpoch: YdocRuntimeEpochSchema.optional(),
}).strict().refine(input => Boolean(
  input.documentId
  || input.workspaceId
  || input.userId
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
  errorCode: CollabErrorCodeSchema.nullable(),
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
