import type { BuddyThinkingLevel } from '@buddy-shared/conversation/modelSelection'

export interface ReasoningSelectorOption {
  label: string
  value: BuddyThinkingLevel
}

export interface ReasoningFieldState {
  dragging: boolean
  progress: number
}
