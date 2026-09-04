import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { ContextUsageSnapshotReader } from './ContextUsageSnapshotService'
import { z } from 'zod'
import { BUDDY_APPROVAL_POLICIES } from '../../../shared/approvalPolicy'
import { BUDDY_EXECUTION_PROFILES } from '../../../shared/executionProfile'
import {
  BUDDY_SERVICE_TIERS,
  BUDDY_THINKING_LEVELS,
} from '../../../shared/modelSelection'
import { parse } from '../rpc/runtimeRequest'

const idSchema = z.string().trim().min(1).max(256)
const sessionIdentitySchema = z.string().regex(/^[A-Z0-9][\w-]{0,127}$/i)
const modelSelectionSchema = z.object({
  modelId: idSchema,
  providerId: idSchema,
  reasoning: z.enum(BUDDY_THINKING_LEVELS).nullable(),
  serviceTier: z.enum(BUDDY_SERVICE_TIERS).nullable(),
}).strict()
const contextUsageSnapshotRequestSchema = z.object({
  approvalPolicy: z.enum(BUDDY_APPROVAL_POLICIES),
  branchId: sessionIdentitySchema.nullable(),
  conversationId: sessionIdentitySchema.nullable(),
  draftId: sessionIdentitySchema,
  executionProfile: z.enum(BUDDY_EXECUTION_PROFILES),
  modelSelection: modelSelectionSchema,
  spaceId: idSchema.nullable(),
}).strict().refine(input => (
  (input.conversationId === null) === (input.branchId === null)
))

export interface RegisterContextRpcOptions {
  rpc: RuntimeRequestRegistrar
  service: ContextUsageSnapshotReader
}

export function registerContextRpc(options: RegisterContextRpcOptions): () => void {
  return options.rpc.onRequest('context.usageSnapshot', params => (
    options.service.getSnapshot(parse(contextUsageSnapshotRequestSchema, params))
  ))
}
