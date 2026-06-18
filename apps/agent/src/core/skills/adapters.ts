import type { RuntimeSkillAdapter } from './adapter'
import { createLocationRuntimeSkillAdapter } from './builtin/location'
import { createMemoryRuntimeSkillAdapter } from './builtin/memory'
import { createTimeRuntimeSkillAdapter } from './builtin/time'
import { createWebSearchRuntimeSkillAdapter } from './builtin/web-search/adapter'

export const DEFAULT_RUNTIME_SKILL_ADAPTERS = [
  createTimeRuntimeSkillAdapter(),
  createLocationRuntimeSkillAdapter(),
  createMemoryRuntimeSkillAdapter(),
  createWebSearchRuntimeSkillAdapter(),
] as const

export function listRuntimeSkillAdapterKeys(
  adapters: readonly RuntimeSkillAdapter[] = DEFAULT_RUNTIME_SKILL_ADAPTERS,
): readonly string[] {
  return adapters.map(adapter => adapter.key)
}

export type { RuntimeSkillAdapter, RuntimeSkillAdapterServices } from './adapter'
