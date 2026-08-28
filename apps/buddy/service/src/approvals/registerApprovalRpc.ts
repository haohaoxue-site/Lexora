import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type {
  ApprovalRecord,
  ApprovalRepository,
} from '../storage/approvalRepository'
import type { ApprovalService } from './ApprovalService'
import { z } from 'zod'
import { parse } from '../rpc/runtimeRequest'

const approvalKinds = ['automation', 'delete', 'mcp', 'network', 'shell', 'system'] as const
const approvalStatuses = ['pending', 'approved', 'denied', 'cancelled'] as const
const idSchema = z.string().trim().min(1).max(256)
const approvalIdSchema = z.object({ approvalId: idSchema }).strict()
const approvalListSchema = z.object({
  limit: z.number().int().positive().max(500).optional(),
  runId: idSchema.nullable().optional(),
  status: z.enum(approvalStatuses).nullable().optional(),
}).strict()

export interface RegisterApprovalRpcOptions {
  repository: Pick<ApprovalRepository, 'list'>
  rpc: RuntimeRequestRegistrar
  service: Pick<ApprovalService, 'resolve'>
}

export function registerApprovalRpc(options: RegisterApprovalRpcOptions): () => void {
  const disposers: Array<() => void> = []
  const on = (method: string, handler: (params: unknown) => Promise<unknown> | unknown) => {
    disposers.push(options.rpc.onRequest(method, handler))
  }

  on('approvals.list', (params) => {
    const input = parse(approvalListSchema, params)
    return options.repository.list(input).map(toPublicApproval)
  })
  on('approvals.approve', async (params) => {
    const input = parse(approvalIdSchema, params)
    return toPublicApproval(await options.service.resolve({
      decision: 'approved',
      id: input.approvalId,
    }))
  })
  on('approvals.deny', async (params) => {
    const input = parse(approvalIdSchema, params)
    return toPublicApproval(await options.service.resolve({
      decision: 'denied',
      id: input.approvalId,
    }))
  })

  return () => disposers.splice(0).forEach(dispose => dispose())
}

function toPublicApproval(approval: ApprovalRecord) {
  return {
    ...approval,
    kind: isApprovalKind(approval.kind) ? approval.kind : 'system',
  }
}

function isApprovalKind(value: string): value is typeof approvalKinds[number] {
  return (approvalKinds as readonly string[]).includes(value)
}
