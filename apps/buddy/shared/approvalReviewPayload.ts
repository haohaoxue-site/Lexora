import { z } from 'zod'

const MAX_COMMAND_SOURCE_LENGTH = 16 * 1024
const MAX_COMMAND_REVIEW_LENGTH = 4 * 1024
const MAX_ARGUMENT_NAMES = 32
const MAX_TARGET_PATHS = 32

const toolNameSchema = z.string().trim().min(1).max(256)

export const approvalReviewPayloadSchema = z.union([
  z.object({
    command: z.string().max(MAX_COMMAND_REVIEW_LENGTH),
    toolName: toolNameSchema,
  }).strict(),
  z.object({
    targetPaths: z.array(z.string().min(1).max(4_096)).max(MAX_TARGET_PATHS),
    toolName: toolNameSchema,
  }).strict(),
  z.object({
    argumentNames: z.array(z.string().min(1).max(256)).max(MAX_ARGUMENT_NAMES),
    toolName: toolNameSchema,
  }).strict(),
])

export type ApprovalReviewPayload = z.infer<typeof approvalReviewPayloadSchema>
export type ApprovalReviewKind = 'delete' | 'mcp' | 'network' | 'shell' | 'system'

export interface CreateApprovalReviewPayloadInput {
  arguments: unknown
  kind: ApprovalReviewKind
  toolName: string
}

export function createApprovalReviewPayload(
  input: CreateApprovalReviewPayloadInput,
): ApprovalReviewPayload {
  if (input.kind === 'shell') {
    return approvalReviewPayloadSchema.parse({
      command: redactShellCommand(readString(input.arguments, 'command')),
      toolName: input.toolName,
    })
  }
  if (input.kind === 'delete') {
    return approvalReviewPayloadSchema.parse({
      targetPaths: readTargetPaths(input.arguments),
      toolName: input.toolName,
    })
  }
  return approvalReviewPayloadSchema.parse({
    argumentNames: readArgumentNames(input.arguments),
    toolName: input.toolName,
  })
}

export function approvalReviewPayloadMatchesKind(
  payload: ApprovalReviewPayload,
  kind: ApprovalReviewKind,
): boolean {
  if (kind === 'shell')
    return 'command' in payload
  if (kind === 'delete')
    return 'targetPaths' in payload
  return 'argumentNames' in payload
}

export function redactShellCommand(command: string): string {
  return command
    .slice(0, MAX_COMMAND_SOURCE_LENGTH)
    .replace(
      /\b([A-Z_]\w*)\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/gi,
      (assignment, name: string) => isSensitiveName(name)
        ? `${name}=[redacted]`
        : assignment,
    )
    .replace(
      /(^|\s)(--?(?:api[-_]?key|token|secret|password|credential|authorization))(?:\s+|=)(?:"[^"]*"|'[^']*'|\S+)/gi,
      '$1$2=[redacted]',
    )
    .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [redacted]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1[redacted]@')
    .slice(0, MAX_COMMAND_REVIEW_LENGTH)
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(
      /\bauthorization[ \t]*[:=][ \t]*([^\r\n]+)/gi,
      (_match, credential: string) => /^Bearer\b/i.test(credential.trim())
        ? 'Authorization: Bearer [redacted]'
        : 'Authorization: [redacted]',
    )
    .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [redacted]')
    .replace(
      /\b((?:api[-_]?key|secret|token|password|credential)\s*[:=]\s*)([^\s,;]+)/gi,
      '$1[redacted]',
    )
}

function isSensitiveName(name: string): boolean {
  return /API_?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(name)
}

function readArgumentNames(value: unknown): string[] {
  const record = readRecord(value)
  return record
    ? Object.keys(record).filter(Boolean).sort().slice(0, MAX_ARGUMENT_NAMES)
    : []
}

function readTargetPaths(value: unknown): string[] {
  const record = readRecord(value)
  if (!record)
    return []
  const paths = [record.path, record.target]
  for (const key of ['paths', 'targets']) {
    const values = record[key]
    if (Array.isArray(values))
      paths.push(...values)
  }
  return [...new Set(paths.filter((path): path is string =>
    typeof path === 'string' && path.trim().length > 0,
  ).map(path => path.slice(0, 4_096)))].slice(0, MAX_TARGET_PATHS)
}

function readString(value: unknown, key: string): string {
  const record = readRecord(value)
  return typeof record?.[key] === 'string' ? record[key] : ''
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}
