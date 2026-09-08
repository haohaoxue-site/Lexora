import { z } from 'zod'

export const buddyAssistantTextPhaseSchema = z.enum(['commentary', 'final_answer'])

export type BuddyAssistantTextPhase = z.infer<typeof buddyAssistantTextPhaseSchema>
