import type { StructuredToolInterface } from '@langchain/core/tools'
import type { AgentMemoryApiClient } from '../../clients/memory'
import type { AgentSkillApiClient } from '../../clients/skills'
import type { WebSearchClient } from '../../integrations/web-search'
import type { RuntimeSkillAdapter } from '../skills/adapters'
import type { LoadedAgentSkill } from '../skills/runtime'
import type { AgentGraphContext } from '../state'
import { createRuntimeToolRegistry } from './registry'

export function resolveRuntimeVisibleTools(input: {
  context: AgentGraphContext | undefined
  memoryApi?: AgentMemoryApiClient
  skillApi?: AgentSkillApiClient
  webSearch?: WebSearchClient
  skillAdapters?: readonly RuntimeSkillAdapter[]
  loadedSkills: LoadedAgentSkill[]
}): StructuredToolInterface[] {
  return createRuntimeToolRegistry(input).tools
}
