import type { SystemCapabilityErrorCode } from './systemCapability'

export const SYSTEM_INSPECT_TOOL_NAME = 'lexora_system_inspect'
export const SYSTEM_ACTION_TOOL_NAME = 'lexora_system_action'

export type SystemToolFailureCode
  = SystemCapabilityErrorCode
    | 'SYSTEM_CAPABILITY_FAILED'
    | 'SYSTEM_INSPECTION_INVALID'

export interface SystemToolFailureRecovery {
  instruction: string
  reuseTargetRef: false
  toolName: typeof SYSTEM_INSPECT_TOOL_NAME
}

export interface SystemToolFailure {
  error: {
    code: SystemToolFailureCode
    recoverable: boolean
    recovery?: SystemToolFailureRecovery
  }
}

const SYSTEM_TOOL_FAILURE_CODES = new Set<SystemToolFailureCode>([
  'SYSTEM_ACTION_INVALID',
  'SYSTEM_ACTION_NOT_ALLOWED',
  'SYSTEM_CAPABILITY_FAILED',
  'SYSTEM_INSPECTION_INVALID',
  'SYSTEM_TARGET_CHANGED',
  'SYSTEM_TARGET_EXPIRED',
  'SYSTEM_TARGET_UNKNOWN',
])

const TARGET_RECOVERY_CODES = new Set<SystemToolFailureCode>([
  'SYSTEM_TARGET_CHANGED',
  'SYSTEM_TARGET_EXPIRED',
  'SYSTEM_TARGET_UNKNOWN',
])

export function createSystemToolFailure(code: SystemToolFailureCode): SystemToolFailure {
  const recoverable = TARGET_RECOVERY_CODES.has(code)
  return {
    error: {
      code,
      recoverable,
      ...(recoverable
        ? {
            recovery: {
              instruction: 'Inspect the requested subject again, then retry only with the new targetRef.',
              reuseTargetRef: false as const,
              toolName: SYSTEM_INSPECT_TOOL_NAME,
            },
          }
        : {}),
    },
  }
}

export function serializeSystemToolFailure(code: SystemToolFailureCode): string {
  return JSON.stringify(createSystemToolFailure(code))
}

export function parseSystemToolFailure(value: string | null): SystemToolFailure | null {
  if (!value)
    return null
  try {
    const payload = readRecord(JSON.parse(value))
    const error = readRecord(payload?.error)
    const code = error?.code
    return typeof code === 'string' && SYSTEM_TOOL_FAILURE_CODES.has(code as SystemToolFailureCode)
      ? createSystemToolFailure(code as SystemToolFailureCode)
      : null
  }
  catch {
    return null
  }
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}
