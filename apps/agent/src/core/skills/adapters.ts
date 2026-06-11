import { createMemoryRuntimeSkillAdapter } from './builtin/memory'

export const DEFAULT_RUNTIME_SKILL_ADAPTERS = [
  createMemoryRuntimeSkillAdapter(),
] as const

export type { RuntimeSkillAdapter, RuntimeSkillAdapterServices } from './adapter'
