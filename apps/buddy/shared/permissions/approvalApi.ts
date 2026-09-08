import type { RuntimeRequestContract } from '../runtime/apiContract'
import type { DeepReadonly } from '../runtime/apiValidation'
import { z } from 'zod'
import { idSchema, nullableTimestampSchema, optionalLimitSchema, timestampSchema } from '../runtime/apiValidation'
import { APPROVAL_REVIEW_KINDS, approvalReviewPayloadMatchesKind, approvalReviewPayloadSchema } from './approvalReviewPayload'

export const approvalSchema = z.object({
  createdAt: timestampSchema,
  id: idSchema,
  kind: z.enum(APPROVAL_REVIEW_KINDS),
  payload: approvalReviewPayloadSchema,
  resolvedAt: nullableTimestampSchema,
  runId: idSchema,
  status: z.enum(['pending', 'approved', 'denied', 'cancelled']),
  summary: z.string().min(1),
  toolCallId: idSchema,
}).strict().refine(
  approval => approvalReviewPayloadMatchesKind(approval.payload, approval.kind),
  { path: ['payload'] },
)

export type LocalApproval = DeepReadonly<z.infer<typeof approvalSchema>>

export const approvalsRequestSchemas = {
  approvalId: z.object({ approvalId: idSchema }).strict(),
  listApprovals: z.object({
    limit: optionalLimitSchema,
    runId: z.string().nullable().optional(),
    status: z.enum(['pending', 'approved', 'denied', 'cancelled']).nullable().optional(),
  }).strict(),
} as const

export const approvalsResponseSchemas = {
  approval: approvalSchema,
  approvals: z.array(approvalSchema),
} as const

export const approvalsRpc = {
  list: { method: 'approvals.list', input: z.object({ limit: optionalLimitSchema, runId: idSchema.nullable().optional(), status: z.enum(['pending', 'approved', 'denied', 'cancelled']).nullable().optional() }).strict(), response: approvalsResponseSchemas.approvals },
  approve: { method: 'approvals.approve', input: approvalsRequestSchemas.approvalId, response: approvalsResponseSchemas.approval },
  approveForTurn: { method: 'approvals.approveForTurn', input: approvalsRequestSchemas.approvalId, response: approvalsResponseSchemas.approval },
  deny: { method: 'approvals.deny', input: approvalsRequestSchemas.approvalId, response: approvalsResponseSchemas.approval },
} as const satisfies Record<string, RuntimeRequestContract>
