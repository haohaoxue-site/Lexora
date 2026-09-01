import type {
  ToolApprovalKind,
  ToolPolicyPath,
  ToolRisk,
} from './toolPolicyContract'
import { createHash } from 'node:crypto'

export interface ToolApprovalScopeInput {
  arguments: unknown
  kind: ToolApprovalKind
  paths?: readonly ToolPolicyPath[]
  resource?: { id: string, kind?: 'connector' | 'space', trusted: boolean }
  risk?: ToolRisk
  toolName: string
}

export function createToolApprovalScopeKey(input: ToolApprovalScopeInput): string {
  const canonical = stableSerialize({
    arguments: input.arguments,
    kind: input.kind,
    paths: input.paths ?? [],
    resource: input.resource ?? null,
    risk: input.risk ?? null,
    toolName: input.toolName,
  })
  return `v1:${createHash('sha256').update(canonical).digest('hex')}`
}

function stableSerialize(value: unknown): string {
  if (value === null)
    return 'null'
  if (typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value)
  if (typeof value === 'number')
    return Number.isFinite(value) ? JSON.stringify(value) : JSON.stringify(String(value))
  if (Array.isArray(value))
    return `[${value.map(stableSerialize).join(',')}]`
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => (
      `${JSON.stringify(key)}:${stableSerialize(record[key])}`
    )).join(',')}}`
  }
  return JSON.stringify(String(value))
}
