import { z } from 'zod'

import {
  BUDDY_DEFAULT_EXECUTION_PROFILE,
  BUDDY_EXECUTION_PROFILES,
} from './executionProfile'

const MAX_COMMAND_SOURCE_LENGTH = 16 * 1024
const MAX_COMMAND_REVIEW_LENGTH = 4 * 1024
const MAX_ARGUMENT_NAMES = 32
const MAX_TARGET_PATHS = 32

export const APPROVAL_REVIEW_KINDS = [
  'read',
  'render',
  'write',
  'delete',
  'shell',
  'system',
  'network',
  'browser',
  'mcp',
  'automation',
] as const

const toolNameSchema = z.string().trim().min(1).max(256)
const systemActionSchema = z.enum([
  'kill-process',
  'restart-service',
  'start-service',
  'stop-service',
  'terminate-process',
])
const systemActionTargetSchema = z.object({
  displayName: z.string().trim().min(1).max(256),
  pid: z.number().int().positive().optional(),
  startedAt: z.iso.datetime().optional(),
  unit: z.string().trim().min(1).max(256).optional(),
}).strict()

const automationOperationSchema = z.enum([
  'upsert',
  'pause',
  'resume',
  'delete',
  'run_now',
])

const browserApprovalEffectSchema = z.enum([
  'account-change',
  'authorize',
  'delete',
  'publish',
  'purchase',
  'send',
  'submit',
])
const browserApprovalOriginSchema = z.union([
  z.literal('about:blank'),
  z.string().trim().min(1).max(4_096).refine((value) => {
    try {
      const url = new URL(value)
      return (url.protocol === 'http:' || url.protocol === 'https:')
        && url.origin === value
    }
    catch {
      return false
    }
  }),
])

export const approvalReviewPayloadSchema = z.discriminatedUnion('card', [
  z.object({
    allowForTurn: z.boolean().default(true),
    card: z.literal('shell'),
    command: z.string().max(MAX_COMMAND_REVIEW_LENGTH),
    toolName: toolNameSchema,
  }).strict(),
  z.object({
    access: z.enum(['delete', 'read', 'render', 'write']),
    allowForTurn: z.boolean().default(true),
    card: z.literal('paths'),
    grant: z.object({
      owner: z.enum(['conversation', 'space']),
      root: z.string().trim().min(1).max(4_096),
    }).strict().nullable(),
    targets: z.array(z.object({
      path: z.string().trim().min(1).max(4_096),
      zone: z.enum(['granted', 'outside', 'sensitive', 'workspace']),
    }).strict()).min(1).max(MAX_TARGET_PATHS),
    toolName: toolNameSchema,
  }).strict(),
  z.object({
    allowForTurn: z.boolean().default(true),
    argumentNames: z.array(z.string().min(1).max(256)).max(MAX_ARGUMENT_NAMES),
    card: z.literal('arguments'),
    toolName: toolNameSchema,
  }).strict(),
  z.object({
    action: systemActionSchema,
    allowForTurn: z.boolean().default(true),
    card: z.literal('system-action'),
    effect: z.string().trim().min(1).max(512),
    expiresAt: z.iso.datetime(),
    interruption: z.enum(['application', 'network', 'none', 'service']),
    reason: z.string().trim().min(1).max(512),
    target: systemActionTargetSchema,
    toolName: toolNameSchema,
  }).strict(),
  z.object({
    allowForTurn: z.boolean().default(false),
    card: z.literal('automation'),
    executionProfile: z.enum(BUDDY_EXECUTION_PROFILES).default(BUDDY_DEFAULT_EXECUTION_PROFILE),
    modelMode: z.string().trim().min(1).max(512),
    name: z.string().trim().min(1).max(80),
    operation: automationOperationSchema,
    spaceId: z.string().trim().min(1).max(256).nullable(),
    promptSummary: z.string().trim().min(1).max(512),
    scheduleSummary: z.string().trim().min(1).max(512),
    timezone: z.string().trim().min(1).max(256),
    toolName: toolNameSchema,
  }).strict(),
  z.object({
    action: z.enum(['click', 'press']),
    actionDigest: z.string().regex(/^[a-f0-9]{64}$/),
    allowForTurn: z.literal(false),
    card: z.literal('browser-action'),
    documentRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    effect: browserApprovalEffectSchema.nullable(),
    key: z.enum(['Enter', 'Space']).nullable(),
    observationId: z.uuid(),
    origin: browserApprovalOriginSchema,
    pageId: z.uuid(),
    risk: z.enum(['commit-like', 'unknown-commit-like']),
    sessionId: z.uuid(),
    targetName: z.string().max(1_024).nullable(),
    targetRole: z.string().trim().min(1).max(1_024).nullable(),
    toolName: toolNameSchema,
  }).strict().superRefine((review, context) => {
    if ((review.risk === 'commit-like') !== (review.effect !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'Known browser commitments require one stable effect',
        path: ['effect'],
      })
    }
    if ((review.action === 'click') !== (review.key === null)) {
      context.addIssue({
        code: 'custom',
        message: 'Browser approval keys must match the action kind',
        path: ['key'],
      })
    }
  }),
])

export type ApprovalReviewPayload = z.infer<typeof approvalReviewPayloadSchema>
export type ApprovalReviewKind = typeof APPROVAL_REVIEW_KINDS[number]
export type AutomationApprovalReview = Extract<
  ApprovalReviewPayload,
  { card: 'automation' }
>
export type AutomationApprovalReviewInput = Omit<
  AutomationApprovalReview,
  'allowForTurn' | 'card' | 'toolName'
>
export type BrowserApprovalReview = Extract<
  ApprovalReviewPayload,
  { card: 'browser-action' }
>
export type BrowserApprovalReviewInput = Omit<
  BrowserApprovalReview,
  'allowForTurn' | 'card' | 'toolName'
>
export type PathApprovalReview = Extract<
  ApprovalReviewPayload,
  { card: 'paths' }
>
export type PathApprovalReviewInput = Omit<
  PathApprovalReview,
  'allowForTurn' | 'card' | 'toolName'
>
export type SystemActionApprovalReview = Extract<
  ApprovalReviewPayload,
  { card: 'system-action' }
>
export type SystemActionApprovalReviewInput = Omit<
  SystemActionApprovalReview,
  'allowForTurn' | 'card' | 'toolName'
>

export interface CreateApprovalReviewPayloadInput {
  allowForTurn: boolean
  arguments: unknown
  automation?: AutomationApprovalReviewInput
  browser?: BrowserApprovalReviewInput
  kind: ApprovalReviewKind
  paths?: PathApprovalReviewInput
  systemAction?: SystemActionApprovalReviewInput
  toolName: string
}

export function createApprovalReviewPayload(
  input: CreateApprovalReviewPayloadInput,
): ApprovalReviewPayload {
  if (input.kind === 'shell') {
    return approvalReviewPayloadSchema.parse({
      allowForTurn: input.allowForTurn,
      card: 'shell',
      command: redactShellCommand(readString(input.arguments, 'command')),
      toolName: input.toolName,
    })
  }
  if (
    input.kind === 'delete'
    || input.kind === 'read'
    || input.kind === 'render'
    || input.kind === 'write'
  ) {
    return approvalReviewPayloadSchema.parse({
      ...input.paths,
      allowForTurn: input.allowForTurn,
      card: 'paths',
      toolName: input.toolName,
    })
  }
  if (input.kind === 'system' && input.systemAction) {
    return approvalReviewPayloadSchema.parse({
      ...input.systemAction,
      allowForTurn: input.allowForTurn,
      card: 'system-action',
      toolName: input.toolName,
    })
  }
  if (input.kind === 'automation' && input.automation) {
    return approvalReviewPayloadSchema.parse({
      ...input.automation,
      allowForTurn: input.allowForTurn,
      card: 'automation',
      toolName: input.toolName,
    })
  }
  if (input.kind === 'browser') {
    return approvalReviewPayloadSchema.parse({
      ...input.browser,
      allowForTurn: input.allowForTurn,
      card: 'browser-action',
      toolName: input.toolName,
    })
  }
  return approvalReviewPayloadSchema.parse({
    allowForTurn: input.allowForTurn,
    argumentNames: readArgumentNames(input.arguments),
    card: 'arguments',
    toolName: input.toolName,
  })
}

export function approvalReviewPayloadMatchesKind(
  payload: ApprovalReviewPayload,
  kind: ApprovalReviewKind,
): boolean {
  if (kind === 'shell')
    return payload.card === 'shell'
  if (kind === 'delete' || kind === 'read' || kind === 'render' || kind === 'write')
    return payload.card === 'paths'
  if (kind === 'system')
    return payload.card === 'arguments' || payload.card === 'system-action'
  if (kind === 'automation')
    return payload.card === 'automation'
  if (kind === 'browser')
    return payload.card === 'browser-action'
  return payload.card === 'arguments'
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
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1[redacted]@')
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

function readString(value: unknown, key: string): string {
  const record = readRecord(value)
  return typeof record?.[key] === 'string' ? record[key] : ''
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}
