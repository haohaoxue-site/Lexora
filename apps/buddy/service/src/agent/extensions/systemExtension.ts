import type { ToolCallEvent } from '@earendil-works/pi-coding-agent'
import type { TSchema } from 'typebox'
import type { SystemActionRequest, SystemCapabilityService } from '../../system/systemCapability'
import type {
  SystemToolFailureCode,
  SystemToolFailureRecovery,
} from '../../system/systemToolFailure'
import type { BuddyInProcessExtension } from '../createBuddyResourceLoader'
import type { BuddyToolClassification } from './toolPolicyExtension'
import { defineTool } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import { Check } from 'typebox/value'

import { SystemCapabilityError } from '../../system/systemCapability'
import {
  createSystemToolFailure,
  serializeSystemToolFailure,
  SYSTEM_ACTION_TOOL_NAME,
} from '../../system/systemToolFailure'

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

const actionInputSchema = Type.Union([
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
])

export interface CreateSystemExtensionOptions {
  service: SystemCapabilityService
}

interface SystemToolDetails {
  code?: SystemToolFailureCode
  effectiveEnvironment: 'host-adapter-mutation'
  receipt?: unknown
  recoverable?: boolean
  recovery?: SystemToolFailureRecovery
}

export function createSystemExtension(
  options: CreateSystemExtensionOptions,
): BuddyInProcessExtension {
  return {
    name: 'lexora-system',
    factory(pi) {
      pi.registerTool(defineTool<TSchema, SystemToolDetails>({
        description: [
          'Request one supported host state change using a structured process or user-service selector.',
          'Use an exact PID, exact process executable name, or exact user service unit; use Pi bash first when diagnosis or target discovery is needed.',
          'Lexora Buddy resolves one concrete target before approval and verifies the same target identity again after approval.',
          'Call this tool when the user asks for the change so controlled mode can show the product approval card; do not replace it with conversational confirmation.',
          'Graceful process termination never escalates to force termination automatically.',
        ].join(' '),
        async execute(toolCallId, input, signal) {
          if (!Check(actionInputSchema, input))
            return invalidResult('SYSTEM_ACTION_INVALID')
          const executionSignal = signal ?? new AbortController().signal
          try {
            const receipt = await options.service.act(
              toolCallId,
              input as SystemActionRequest,
              executionSignal,
            )
            return {
              content: [{ type: 'text', text: JSON.stringify(receipt, null, 2) }],
              details: {
                effectiveEnvironment: 'host-adapter-mutation',
                receipt,
              },
              isError: receipt.status === 'failed',
            }
          }
          catch (error) {
            executionSignal.throwIfAborted()
            return errorResult(error)
          }
        },
        label: 'Change this computer',
        name: SYSTEM_ACTION_TOOL_NAME,
        parameters: actionInputSchema,
      }))
    },
  }
}

export async function classifySystemTool(
  service: SystemCapabilityService,
  event: ToolCallEvent,
  signal: AbortSignal,
): Promise<BuddyToolClassification | null> {
  if (event.toolName !== SYSTEM_ACTION_TOOL_NAME)
    return null
  if (!Check(actionInputSchema, event.input))
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

function invalidResult(code: SystemToolFailureCode) {
  return failureResult(code)
}

function errorResult(error: unknown) {
  const code: SystemToolFailureCode = error instanceof SystemCapabilityError
    ? error.code
    : 'SYSTEM_CAPABILITY_FAILED'
  return failureResult(code)
}

function failureResult(code: SystemToolFailureCode) {
  const failure = createSystemToolFailure(code)
  return {
    content: [{ type: 'text' as const, text: serializeSystemToolFailure(code) }],
    details: {
      code,
      effectiveEnvironment: 'host-adapter-mutation' as const,
      recoverable: failure.error.recoverable,
      ...(failure.error.recovery ? { recovery: failure.error.recovery } : {}),
    },
    isError: true,
  }
}
