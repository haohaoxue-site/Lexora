import { createMemoryRuntimeSkillAdapter } from './builtin/memory'
import { createWebSearchRuntimeSkillAdapter } from './builtin/web-search/adapter'

export const DEFAULT_RUNTIME_SKILL_ADAPTERS = [
  createMemoryRuntimeSkillAdapter(),
  createWebSearchRuntimeSkillAdapter(),
] as const

export type { RuntimeSkillAdapter, RuntimeSkillAdapterServices } from './adapter'
