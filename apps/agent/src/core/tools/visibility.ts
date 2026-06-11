import type { StructuredToolInterface } from '@langchain/core/tools'
import type { AgentMemoryApiClient } from '../../clients/memory'
import type { AgentSkillApiClient } from '../../clients/skills'
import type { RuntimeSkillAdapter } from '../skills/adapters'
import type { LoadedAgentSkill } from '../skills/runtime'
import type { AgentGraphContext } from '../state'
import { DEFAULT_RUNTIME_SKILL_ADAPTERS } from '../skills/adapters'
import {
  createAgentSkillTools,
  isSkillLoaded,
} from '../skills/runtime'

export function resolveRuntimeVisibleTools(input: {
  context: AgentGraphContext | undefined
  memoryApi?: AgentMemoryApiClient
  skillApi?: AgentSkillApiClient
  skillAdapters?: readonly RuntimeSkillAdapter[]
  loadedSkills: LoadedAgentSkill[]
}): StructuredToolInterface[] {
  const tools: StructuredToolInterface[] = []
  const services = {
    memoryApi: input.memoryApi,
  }
  const skillAdapters = input.skillAdapters ?? DEFAULT_RUNTIME_SKILL_ADAPTERS
  const hasSkillRuntime = Boolean(input.skillApi)
  const hasRuntimeSkillCatalog = Boolean(
    input.skillApi
    && input.context?.skillContext
    && input.context.skillContext.availableSkills.length > 0,
  )

  if (hasRuntimeSkillCatalog) {
    tools.push(...createAgentSkillTools())
  }

  for (const adapter of skillAdapters) {
    if (
      adapter.isAvailable({ context: input.context, services })
      && (!hasSkillRuntime || isSkillLoaded(input.loadedSkills, adapter.key))
    ) {
      tools.push(...adapter.createTools({
        context: input.context,
        services,
      }))
    }
  }

  return tools
}
