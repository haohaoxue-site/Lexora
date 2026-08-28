import type { ToolCallEvent } from '@earendil-works/pi-coding-agent'
import type { BuddyToolPresentation } from '../../../shared/runEventPresentation'
import type { BuddyToolClassification } from '../approvals/toolClassification'
import type { CreateBuddyToolPresentationInput } from '../events/toolPresentationSupport'

import {
  readOptionalString,
  readRecord,
  readToolDetails,
} from '../events/toolPresentationSupport'

export interface PetToolDetails {
  code?: string
  macro: string
  status: string
}

export const PET_TOOL_NAME = 'lexora_buddy_pet'

const PET_TOOL_CLASSIFICATION: BuddyToolClassification = {
  risk: 'visual',
  source: 'lexora',
}

export function classifyPetTool(
  event: Pick<ToolCallEvent, 'toolName'>,
): BuddyToolClassification | null {
  return event.toolName === PET_TOOL_NAME ? PET_TOOL_CLASSIFICATION : null
}

export function createPetToolPresentation(
  input: CreateBuddyToolPresentationInput,
): Extract<BuddyToolPresentation, { card: 'pet' }> | null {
  if (input.toolName !== PET_TOOL_NAME)
    return null
  const arguments_ = readRecord(input.arguments)
  const details = readToolDetails(input.result)
  return {
    card: 'pet',
    description: readOptionalString(arguments_, 'description'),
    macro: readOptionalString(details, 'macro')
      ?? readOptionalString(arguments_, 'macro')
      ?? 'unknown',
    status: readOptionalString(details, 'status') ?? (input.result ? 'completed' : 'running'),
  }
}
