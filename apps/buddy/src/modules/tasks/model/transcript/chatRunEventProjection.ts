import type { BuddyAssistantTextPhase } from '@buddy-shared/runs/assistantTextPhase'

import type { LocalRunEvent } from '@buddy-shared/runs/runApi'
import { buddyAssistantTextPhaseSchema } from '@buddy-shared/runs/assistantTextPhase'

export interface ChatProjectionReducer<T> {
  append: (events: ReadonlyArray<LocalRunEvent>) => void
  project: () => T
}

export function readPayload(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function readNonnegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null
}

export function readAssistantTextPhase(value: unknown): BuddyAssistantTextPhase | null {
  const phase = buddyAssistantTextPhaseSchema.safeParse(value)
  return phase.success ? phase.data : null
}
