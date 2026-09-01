import type { ToolCallEvent } from '@earendil-works/pi-coding-agent'
import type { BuddyToolPresentation } from '../../../shared/runEventPresentation'
import type { BuddyToolClassificationResult } from '../approvals/toolClassification'
import type { CreateBuddyToolPresentationInput } from '../events/toolPresentationSupport'
import type { SystemActionRequest, SystemCapabilityService } from './systemCapability'
import type {
  SystemToolFailureCode,
  SystemToolFailureRecovery,
} from './systemToolFailure'
import { Type } from 'typebox'
import { Check } from 'typebox/value'

import { redactSensitiveText } from '../../../shared/approvalReviewPayload'
import { createToolClassificationFailure } from '../approvals/toolClassification'
import {
  boundedToolPreview,
  readBoolean,
  readOptionalString,
  readRecord,
  readToolDetails,
  readToolOutput,
} from '../events/toolPresentationSupport'
import { SystemCapabilityError } from './systemCapability'
import {
  parseSystemToolFailure,
  serializeSystemToolFailure,
  SYSTEM_ACTION_TOOL_NAME,
} from './systemToolFailure'

export { SYSTEM_ACTION_TOOL_NAME }

const processTargetSchema = Type.Union([
  Type.Object({
    kind: Type.Literal('process'),
    pid: Type.Integer({ maximum: 2_147_483_647, minimum: 2 }),
  }, { additionalProperties: false }),
  Type.Object({
    kind: Type.Literal('process'),
    name: Type.String({ maxLength: 256, minLength: 1 }),
  }, { additionalProperties: false }),
])

const serviceTargetSchema = Type.Object({
  kind: Type.Literal('service'),
  scope: Type.Literal('user'),
  unit: Type.String({ maxLength: 256, minLength: 9, pattern: '\\.service$' }),
}, { additionalProperties: false })

export const systemActionInputSchema = Type.Union([
  Type.Object({
    action: Type.Union([
      Type.Literal('kill-process'),
      Type.Literal('terminate-process'),
    ]),
    reason: Type.String({ maxLength: 512, minLength: 1 }),
    target: processTargetSchema,
  }, { additionalProperties: false }),
  Type.Object({
    action: Type.Union([
      Type.Literal('restart-service'),
      Type.Literal('start-service'),
      Type.Literal('stop-service'),
    ]),
    reason: Type.String({ maxLength: 512, minLength: 1 }),
    target: serviceTargetSchema,
  }, { additionalProperties: false }),
], { type: 'object' })

export interface SystemToolDetails {
  code?: SystemToolFailureCode
  effectiveEnvironment: 'host-adapter-mutation'
  receipt?: unknown
  recoverable?: boolean
  recovery?: SystemToolFailureRecovery
}

export async function classifySystemTool(
  service: SystemCapabilityService,
  event: ToolCallEvent,
  signal: AbortSignal,
): Promise<BuddyToolClassificationResult | null> {
  if (event.toolName !== SYSTEM_ACTION_TOOL_NAME)
    return null
  try {
    if (!Check(systemActionInputSchema, event.input))
      throw new SystemCapabilityError('SYSTEM_ACTION_INVALID')
    const prepared = await service.prepareAction(
      event.toolCallId,
      event.input as SystemActionRequest,
      signal,
    )
    return {
      approval: {
        kind: 'system',
        summary: prepared.summary,
        systemAction: prepared.review,
      },
      risk: 'system',
      source: 'lexora',
    }
  }
  catch (error) {
    if (error instanceof SystemCapabilityError) {
      return createToolClassificationFailure(
        serializeSystemToolFailure(error.code),
      )
    }
    throw error
  }
}

export function createSystemToolPresentation(
  input: CreateBuddyToolPresentationInput,
): Extract<BuddyToolPresentation, { card: 'system' }> | null {
  if (input.toolName !== SYSTEM_ACTION_TOOL_NAME)
    return null
  const arguments_ = readRecord(input.arguments)
  const receipt = readRecord(readToolDetails(input.result)?.receipt)
  const target = readRecord(receipt?.target)
  const failureStatus = readSystemFailureStatus(input.result)
  return {
    action: readSystemAction(arguments_, receipt),
    card: 'system',
    description: readOptionalString(arguments_, 'description')
      ?? readOptionalString(arguments_, 'reason'),
    status: readOptionalString(receipt, 'status')
      ?? failureStatus
      ?? (input.result ? 'failed' : 'running'),
    target: readOptionalString(target, 'displayName'),
    verified: readBoolean(receipt, 'verified'),
    ...boundedSystemPreview(input.result),
  }
}

function boundedSystemPreview(value: unknown): ReturnType<typeof boundedToolPreview> {
  if (parseSystemToolFailure(readToolOutput(value)))
    return boundedToolPreview(null)
  const details = readToolDetails(value)
  const detail = details?.receipt
  if (detail === undefined)
    return boundedToolPreview(readToolOutput(value))
  try {
    return boundedToolPreview(redactSensitiveText(JSON.stringify(detail, null, 2)))
  }
  catch {
    return boundedToolPreview('Lexora Buddy system capability returned an unreadable result')
  }
}

function readSystemAction(
  arguments_: Record<string, unknown> | null,
  receipt: Record<string, unknown> | null,
): Extract<BuddyToolPresentation, { card: 'system' }>['action'] {
  const action = readOptionalString(receipt, 'action') ?? readOptionalString(arguments_, 'action')
  switch (action) {
    case 'kill-process':
    case 'restart-service':
    case 'start-service':
    case 'stop-service':
    case 'terminate-process':
      return action
    default:
      return 'terminate-process'
  }
}

function readSystemFailureStatus(value: unknown): string | null {
  const detailsCode = readOptionalString(readToolDetails(value), 'code')
  const code = detailsCode ?? parseSystemToolFailure(readToolOutput(value))?.error.code
  switch (code) {
    case 'SYSTEM_ACTION_EXPIRED':
    case 'SYSTEM_ACTION_NOT_PREPARED': return 'action-expired'
    case 'SYSTEM_TARGET_AMBIGUOUS': return 'target-ambiguous'
    case 'SYSTEM_TARGET_CHANGED': return 'target-changed'
    case 'SYSTEM_TARGET_NOT_FOUND': return 'target-not-found'
    default: return null
  }
}
