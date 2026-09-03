import { z } from 'zod'
import {
  BROWSER_MAX_OBSERVATION_ELEMENT_LIMIT,
  browserActionKindSchema,
  browserCapabilityActParamsSchema,
  browserErrorCodeSchema,
  browserObservationSchema,
  browserStateSnapshotSchema,
} from './browserProtocol'

export const BROWSER_ADAPTER_PROTOCOL_VERSION = 1 as const
export const BROWSER_ADAPTER_DEFAULT_LEASE_TTL_MS = 60_000
export const BROWSER_ADAPTER_MAX_LEASE_TTL_MS = 5 * 60_000
export const BROWSER_ADAPTER_MAX_REQUEST_BYTES = 64 * 1_024

export const BROWSER_ADAPTER_FAILURE_CODES = [
  'BROWSER_ADAPTER_APPROVAL_REQUIRED',
  'BROWSER_ADAPTER_AUTH_FAILED',
  'BROWSER_ADAPTER_LEASE_EXPIRED',
  'BROWSER_ADAPTER_REQUEST_INVALID',
] as const

export const BROWSER_ADAPTER_RECOVERY_ACTIONS = [
  'read_again',
  'open_again',
  'request_buddy_approval',
  'request_human_control',
  'request_new_adapter_lease',
  'start_local_server',
] as const

const browserAdapterConversationIdSchema = z.string().trim().min(1).max(128)
const browserAdapterIdSchema = z.string().min(1).max(128).regex(/^[\w.-]+$/)
const browserAdapterTokenSchema = z.string().regex(/^[\da-f]{64}$/)
const browserAdapterSocketPathSchema = z.string().min(1).max(4_096).regex(/^\//)
const emptyParamsSchema = z.object({}).strict()

export const browserAdapterFailureCodeSchema = z.union([
  browserErrorCodeSchema,
  z.enum(BROWSER_ADAPTER_FAILURE_CODES),
])

export const browserAdapterRecoveryActionSchema = z.enum(
  BROWSER_ADAPTER_RECOVERY_ACTIONS,
)

export const browserAdapterIssueLeaseParamsSchema = z.object({
  conversationId: browserAdapterConversationIdSchema,
  ttlMs: z.number().int().min(1_000).max(BROWSER_ADAPTER_MAX_LEASE_TTL_MS).optional(),
}).strict()

export const browserAdapterLeaseSchema = z.object({
  conversationId: browserAdapterConversationIdSchema,
  expiresAt: z.iso.datetime(),
  pageId: z.uuid(),
  protocolVersion: z.literal(BROWSER_ADAPTER_PROTOCOL_VERSION),
  sessionId: z.uuid(),
  socketPath: browserAdapterSocketPathSchema,
  token: browserAdapterTokenSchema,
}).strict()

const browserAdapterRequestBase = {
  id: browserAdapterIdSchema,
  protocolVersion: z.literal(BROWSER_ADAPTER_PROTOCOL_VERSION),
  token: browserAdapterTokenSchema,
} as const

export const browserAdapterRequestSchema = z.discriminatedUnion('method', [
  z.object({
    ...browserAdapterRequestBase,
    method: z.literal('state'),
    params: emptyParamsSchema,
  }).strict(),
  z.object({
    ...browserAdapterRequestBase,
    method: z.literal('snapshot'),
    params: z.object({
      maxElements: z.number().int().min(1).max(BROWSER_MAX_OBSERVATION_ELEMENT_LIMIT).optional(),
    }).strict(),
  }).strict(),
  z.object({
    ...browserAdapterRequestBase,
    method: z.literal('action'),
    params: browserCapabilityActParamsSchema,
  }).strict(),
  z.object({
    ...browserAdapterRequestBase,
    method: z.literal('close'),
    params: emptyParamsSchema,
  }).strict(),
])

export const browserAdapterSuccessResultSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('state'),
    state: browserStateSnapshotSchema,
  }).strict(),
  z.object({
    kind: z.literal('snapshot'),
    observation: browserObservationSchema,
  }).strict(),
  z.object({
    actionKind: browserActionKindSchema,
    kind: z.literal('action'),
    observation: browserObservationSchema,
    state: browserStateSnapshotSchema,
  }).strict(),
  z.object({
    kind: z.literal('close'),
    revoked: z.literal(true),
  }).strict(),
])

export const browserAdapterSuccessResponseSchema = z.object({
  id: browserAdapterIdSchema,
  ok: z.literal(true),
  protocolVersion: z.literal(BROWSER_ADAPTER_PROTOCOL_VERSION),
  result: browserAdapterSuccessResultSchema,
}).strict()

export const browserAdapterFailureResponseSchema = z.object({
  error: z.object({
    code: browserAdapterFailureCodeSchema,
    recovery: browserAdapterRecoveryActionSchema.nullable(),
  }).strict(),
  id: browserAdapterIdSchema,
  ok: z.literal(false),
  protocolVersion: z.literal(BROWSER_ADAPTER_PROTOCOL_VERSION),
}).strict()

export const browserAdapterResponseSchema = z.discriminatedUnion('ok', [
  browserAdapterSuccessResponseSchema,
  browserAdapterFailureResponseSchema,
])

export type BrowserAdapterFailureCode = z.infer<typeof browserAdapterFailureCodeSchema>
export type BrowserAdapterIssueLeaseParams = z.infer<typeof browserAdapterIssueLeaseParamsSchema>
export type BrowserAdapterLease = z.infer<typeof browserAdapterLeaseSchema>
export type BrowserAdapterRecoveryAction = z.infer<typeof browserAdapterRecoveryActionSchema>
export type BrowserAdapterRequest = z.infer<typeof browserAdapterRequestSchema>
export type BrowserAdapterResponse = z.infer<typeof browserAdapterResponseSchema>
export type BrowserAdapterSuccessResult = z.infer<typeof browserAdapterSuccessResultSchema>
