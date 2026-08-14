import type { PetExecuteSequenceParams, PetPrimitiveStep } from '../../../shared/petProtocol'
import { petExecuteSequenceParamsSchema } from '../../../shared/petProtocol'

export const PET_MACRO_IDS = [
  'thinking',
  'working',
  'awaitApproval',
  'celebrate',
  'sad',
  'curious',
  'explain',
  'returnHome',
] as const

export type PetMacroId = typeof PET_MACRO_IDS[number]

interface PetMacroDefinition {
  priority: number
  steps: readonly PetPrimitiveStep[]
}

const PET_MACRO_CATALOG: Record<PetMacroId, PetMacroDefinition> = {
  thinking: loopMacro('thinking', 3000, 2420, 10),
  working: loopMacro('working', 3000, 1840, 10),
  awaitApproval: loopMacro('approval', 5000, 2540, 30),
  celebrate: onceMacro('celebrate', 1720, 20),
  sad: loopMacro('sad', 3000, 2400, 20),
  curious: onceMacro('curious', 2880, 20),
  explain: loopMacro('explain', 3000, 1940, 20),
  returnHome: {
    priority: 40,
    steps: [{
      after: 'idle',
      interruptPolicy: 'interruptible',
      kind: 'moveByPath',
      path: [{ kind: 'home' }],
      timeoutMs: 15_000,
    }],
  },
}

export function compilePetMacro(macro: PetMacroId, requestId: string): PetExecuteSequenceParams {
  const definition = PET_MACRO_CATALOG[macro]
  return petExecuteSequenceParamsSchema.parse({
    priority: definition.priority,
    requestId,
    steps: definition.steps.map(step => structuredClone(step)),
  })
}

function loopMacro(
  animation: 'approval' | 'explain' | 'sad' | 'thinking' | 'working',
  durationMs: number,
  clipDurationMs: number,
  priority: number,
): PetMacroDefinition {
  return {
    priority,
    steps: [{
      animation,
      completionBehavior: 'restoreIdle',
      interruptPolicy: 'interruptible',
      kind: 'playAction',
      playback: { clipDurationMs, durationMs, kind: 'loopForDuration' },
      timeoutMs: durationMs + 1000,
    }],
  }
}

function onceMacro(
  animation: 'celebrate' | 'curious',
  durationMs: number,
  priority: number,
): PetMacroDefinition {
  return {
    priority,
    steps: [{
      animation,
      completionBehavior: 'restoreIdle',
      interruptPolicy: 'finishStep',
      kind: 'playAction',
      playback: { durationMs, kind: 'once' },
      timeoutMs: durationMs + 3280,
    }],
  }
}
