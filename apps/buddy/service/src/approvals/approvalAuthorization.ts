import type { ApprovalReuseScope } from '../../../shared/permissions/approvalReviewPayload'
import type { ApprovalRequest } from './ApprovalService'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { APPROVAL_REUSE_SCOPES } from '../../../shared/permissions/approvalReviewPayload'

export interface ApprovalAuthorizationKeys {
  operation: string
  source: string
}

export interface ApprovalAuthorizationOverride {
  operation: readonly unknown[]
  source: readonly unknown[]
}

export function approvalReuseScopes(enabled: boolean): readonly ApprovalReuseScope[] {
  return enabled ? APPROVAL_REUSE_SCOPES : []
}

export function createApprovalAuthorizationKeys(
  input: Pick<ApprovalRequest, 'arguments' | 'cwd' | 'kind' | 'paths' | 'shell' | 'toolName'>,
  override?: ApprovalAuthorizationOverride,
): ApprovalAuthorizationKeys {
  if (override) {
    return {
      operation: digest(['operation', ...override.operation]),
      source: digest(['source', ...override.source]),
    }
  }

  const source = [input.kind, input.toolName, input.shell?.boundary ?? null]
  if (input.kind === 'shell') {
    return {
      operation: digest([
        input.kind,
        input.toolName,
        input.shell?.cwd ?? null,
        normalizeCommand(readString(input.arguments, 'command')),
      ]),
      source: digest(source),
    }
  }

  if (input.paths?.targets.length) {
    return {
      operation: digest([
        input.kind,
        input.toolName,
        input.paths.access,
        [...input.paths.targets].map(target => normalizePath(target.path, input.cwd)).sort(),
      ]),
      source: digest(source),
    }
  }

  if (input.kind === 'network') {
    return {
      operation: digest([
        input.kind,
        input.toolName,
        readString(input.arguments, 'provider'),
        normalizeNetworkTarget(readString(input.arguments, 'query') || readString(input.arguments, 'url')),
      ]),
      source: digest(source),
    }
  }

  return {
    operation: digest([input.kind, input.toolName]),
    source: digest(source),
  }
}

function digest(value: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function normalizeCommand(command: string): string {
  return command.replace(/\r\n/g, '\n').trim()
}

function normalizePath(path: string, cwd?: string): string {
  return cwd ? resolve(cwd, path) : path
}

function normalizeNetworkTarget(target: string): string {
  try {
    const url = new URL(target)
    url.hash = ''
    return url.toString()
  }
  catch {
    return target.trim()
  }
}

function readString(value: unknown, key: string): string {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return ''
  const entry = (value as Record<string, unknown>)[key]
  return typeof entry === 'string' ? entry : ''
}
