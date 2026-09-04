import type { TSchema } from 'typebox'
import type { SystemActionRequest, SystemCapabilityService } from '../../system/systemCapability'
import type { SystemToolDetails } from '../../system/systemToolContract'
import type { SystemToolFailureCode } from '../../system/systemToolFailure'
import type { BuddyInProcessExtension } from '../createBuddyResourceLoader'
import { defineTool } from '@earendil-works/pi-coding-agent'
import { Check } from 'typebox/value'

import { SystemCapabilityError } from '../../system/systemCapability'
import {
  SYSTEM_ACTION_TOOL_NAME,
  systemActionInputSchema,
} from '../../system/systemToolContract'
import {
  createSystemToolFailure,
  serializeSystemToolFailure,
} from '../../system/systemToolFailure'

export interface CreateSystemExtensionOptions {
  service: SystemCapabilityService
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
          'Use an exact PID, exact process executable name, or exact user service unit; use the active Pi shell first when diagnosis or target discovery is needed.',
          'Lexora Buddy resolves one concrete target before approval and verifies the same target identity again after approval.',
          'Call this tool when the user asks for the change so Buddy can show the product approval card; do not replace it with conversational confirmation.',
          'Graceful process termination never escalates to force termination automatically.',
        ].join(' '),
        async execute(toolCallId, input, signal) {
          if (!Check(systemActionInputSchema, input))
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
        parameters: systemActionInputSchema,
      }))
    },
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
