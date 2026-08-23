import type { Static, TSchema } from 'typebox'
import type { SystemCapabilityService } from '../../system/systemCapability'
import type {
  SystemToolFailureCode,
  SystemToolFailureRecovery,
} from '../../system/systemToolFailure'
import type { BuddyInProcessExtension } from '../createBuddyResourceLoader'
import type { BuddyToolClassification } from './toolPolicyExtension'
import { defineTool } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

import { Check } from 'typebox/value'
import {
  SystemCapabilityError,
} from '../../system/systemCapability'
import {
  createSystemToolFailure,
  serializeSystemToolFailure,
  SYSTEM_ACTION_TOOL_NAME,
  SYSTEM_INSPECT_TOOL_NAME,
} from '../../system/systemToolFailure'

export { SYSTEM_ACTION_TOOL_NAME, SYSTEM_INSPECT_TOOL_NAME }

const inspectInputSchema = Type.Object({
  detail: Type.Optional(Type.Union([
    Type.Literal('summary'),
    Type.Literal('diagnostic'),
  ])),
  include: Type.Optional(Type.Array(Type.Union([
    Type.Literal('applications'),
    Type.Literal('listeners'),
    Type.Literal('processes'),
    Type.Literal('services'),
  ]), { maxItems: 4, minItems: 1, uniqueItems: true })),
  subject: Type.String({ maxLength: 256, minLength: 1 }),
}, { additionalProperties: false })

const actionInputSchema = Type.Object({
  action: Type.Union([
    Type.Literal('kill-process'),
    Type.Literal('restart-service'),
    Type.Literal('start-service'),
    Type.Literal('stop-service'),
    Type.Literal('terminate-process'),
  ]),
  reason: Type.String({ maxLength: 512, minLength: 1 }),
  targetRef: Type.String({ maxLength: 256, pattern: '^system-target:', minLength: 1 }),
}, { additionalProperties: false })

type InspectInput = Static<typeof inspectInputSchema>
type ActionInput = Static<typeof actionInputSchema>

export interface CreateSystemExtensionOptions {
  service: SystemCapabilityService
}

interface SystemToolDetails {
  code?: SystemToolFailureCode
  effectiveEnvironment: 'host-adapter-mutation' | 'host-adapter-readonly'
  inspection?: unknown
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
          'Inspect real host application, process, service, and listening-port facts.',
          'Use this instead of workspace shell commands for questions about the current computer.',
          'Report returned facts separately from your own inferences; partial diagnostics do not prove absence.',
        ].join(' '),
        async execute(_toolCallId, input, signal) {
          if (!Check(inspectInputSchema, input))
            return invalidResult('SYSTEM_INSPECTION_INVALID', 'host-adapter-readonly')
          const executionSignal = signal ?? new AbortController().signal
          try {
            const inspection = await options.service.inspect(
              input as InspectInput,
              executionSignal,
            )
            return {
              content: [{ type: 'text', text: JSON.stringify(inspection, null, 2) }],
              details: {
                effectiveEnvironment: 'host-adapter-readonly',
                inspection,
              },
            }
          }
          catch (error) {
            executionSignal.throwIfAborted()
            return errorResult(error, 'host-adapter-readonly')
          }
        },
        label: 'Inspect this computer',
        name: SYSTEM_INSPECT_TOOL_NAME,
        parameters: inspectInputSchema,
      }))
      pi.registerTool(defineTool<TSchema, SystemToolDetails>({
        description: [
          'Request one host action against an opaque targetRef returned by lexora_system_inspect.',
          'Call this when the user asks for the change; Lexora Buddy will pause execution and show the product approval card.',
          'Do not ask for a conversational confirmation instead of calling this tool.',
          'Never accepts a PID, signal, unit name, executable, or shell command directly.',
          'Graceful termination never escalates to force termination automatically.',
          'If a failed result is recoverable, follow its recovery instruction and never retry the old targetRef.',
        ].join(' '),
        async execute(_toolCallId, input, signal) {
          if (!Check(actionInputSchema, input))
            return invalidResult('SYSTEM_ACTION_INVALID', 'host-adapter-mutation')
          const executionSignal = signal ?? new AbortController().signal
          try {
            const receipt = await options.service.act(
              input as ActionInput,
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
            return errorResult(error, 'host-adapter-mutation')
          }
        },
        label: 'Change this computer',
        name: SYSTEM_ACTION_TOOL_NAME,
        parameters: actionInputSchema,
      }))
    },
  }
}

export function classifySystemTool(
  service: SystemCapabilityService,
  toolName: string,
  input: unknown,
): BuddyToolClassification | null {
  if (toolName === SYSTEM_INSPECT_TOOL_NAME) {
    return {
      origin: 'first-party',
      risk: 'read',
    }
  }
  if (toolName !== SYSTEM_ACTION_TOOL_NAME)
    return null
  if (!Check(actionInputSchema, input))
    throw new SystemCapabilityError('SYSTEM_ACTION_INVALID')
  const prepared = service.prepareAction(input as ActionInput)
  return {
    approval: {
      summary: prepared.summary,
      systemAction: prepared.review,
    },
    origin: 'first-party',
    risk: 'system',
  }
}

function invalidResult(
  code: SystemToolFailureCode,
  effectiveEnvironment: SystemToolDetails['effectiveEnvironment'],
) {
  return failureResult(code, effectiveEnvironment)
}

function errorResult(
  error: unknown,
  effectiveEnvironment: SystemToolDetails['effectiveEnvironment'],
) {
  const code: SystemToolFailureCode = error instanceof SystemCapabilityError
    ? error.code
    : 'SYSTEM_CAPABILITY_FAILED'
  return failureResult(code, effectiveEnvironment)
}

function failureResult(
  code: SystemToolFailureCode,
  effectiveEnvironment: SystemToolDetails['effectiveEnvironment'],
) {
  const failure = createSystemToolFailure(code)
  return {
    content: [{ type: 'text' as const, text: serializeSystemToolFailure(code) }],
    details: {
      code,
      effectiveEnvironment,
      recoverable: failure.error.recoverable,
      ...(failure.error.recovery ? { recovery: failure.error.recovery } : {}),
    },
    isError: true,
  }
}
