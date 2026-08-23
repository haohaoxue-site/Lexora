import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import type { TSchema } from 'typebox'
import type { BuddyToolClassification } from '../agent/extensions/toolPolicyExtension'
import type { PetActionService } from './PetActionService'
import { defineTool } from '@earendil-works/pi-coding-agent'
import { z } from 'zod'

import { PET_MACRO_IDS } from './petMacroCatalog'

const petToolInputSchema = z.object({
  macro: z.enum(PET_MACRO_IDS),
}).strict()

const petToolParameters = {
  additionalProperties: false,
  properties: {
    macro: { enum: [...PET_MACRO_IDS], type: 'string' },
  },
  required: ['macro'],
  type: 'object',
} as TSchema

export interface CreatePetToolOptions {
  getRunId?: () => string | undefined
  service: PetActionService
}

interface PetToolDetails {
  code?: string
  macro: string
  status: string
}

export const PET_TOOL_CLASSIFICATION: BuddyToolClassification = {
  origin: 'first-party',
  risk: 'visual',
}

export const PET_TOOL_NAME = 'lexora_buddy_pet'

export function createPetTool(options: CreatePetToolOptions): ToolDefinition {
  return defineTool<TSchema, PetToolDetails>({
    description: 'Express a simple Lexora Buddy desktop companion action',
    execute: async (toolCallId, parameters) => {
      const parsed = petToolInputSchema.safeParse(parameters)
      if (!parsed.success) {
        return {
          content: [{ type: 'text', text: 'Lexora Buddy pet action input is invalid' }],
          details: { code: 'VALIDATION_FAILED', macro: 'invalid', status: 'failed' },
          isError: false,
        }
      }
      const result = await options.service.execute({
        macro: parsed.data.macro,
        runId: options.getRunId?.(),
        toolCallId,
      })
      return {
        content: [{
          type: 'text',
          text: result.status === 'completed'
            ? `Lexora Buddy pet action completed: ${parsed.data.macro}`
            : `Lexora Buddy pet action was not completed: ${parsed.data.macro}`,
        }],
        details: {
          ...('code' in result ? { code: result.code } : {}),
          macro: parsed.data.macro,
          status: result.status,
        },
        isError: false,
      }
    },
    label: 'Lexora Buddy pet',
    name: PET_TOOL_NAME,
    parameters: petToolParameters,
  })
}
