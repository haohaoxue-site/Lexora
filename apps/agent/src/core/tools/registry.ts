import type { AgentToolCallKind } from '@haohaoxue/lexora-contracts/agent'
import type { StructuredToolInterface } from '@langchain/core/tools'
import type { AgentMemoryApiClient } from '../../clients/memory'
import type { AgentSkillApiClient } from '../../clients/skills'
import type { WebSearchClient } from '../../integrations/web-search'
import type { RuntimeSkillAdapter, RuntimeSkillAdapterServices } from '../skills/adapters'
import type { LoadedAgentSkill } from '../skills/runtime'
import type { AgentGraphContext } from '../state'
import { AGENT_SKILL_ACTIVATION_MODE } from '@haohaoxue/lexora-contracts'
import { DEFAULT_RUNTIME_SKILL_ADAPTERS } from '../skills/adapters'
import {
  createAgentSkillTools,
  isSkillLoaded,
} from '../skills/runtime'

export interface RuntimeToolDescriptor {
  name: string
  kind: AgentToolCallKind
  tool: StructuredToolInterface
  ownerSkillKey?: string
}

export interface RuntimeToolRegistry {
  tools: StructuredToolInterface[]
  descriptors: RuntimeToolDescriptor[]
  availableSkillAdapters: RuntimeSkillAdapter[]
  visibleSkillToolNames: ReadonlySet<string>
  hasVisibleTool: (toolName: string) => boolean
}

export function createRuntimeToolRegistry(input: {
  context: AgentGraphContext | undefined
  memoryApi?: AgentMemoryApiClient
  skillApi?: AgentSkillApiClient
  webSearch?: WebSearchClient
  skillAdapters?: readonly RuntimeSkillAdapter[]
  loadedSkills: LoadedAgentSkill[]
}): RuntimeToolRegistry {
  const descriptors: RuntimeToolDescriptor[] = []
  const availableSkillAdapters: RuntimeSkillAdapter[] = []
  const adapterServices = createRuntimeSkillAdapterServices(input)
  const skillAdapters = input.skillAdapters ?? DEFAULT_RUNTIME_SKILL_ADAPTERS
  const hasSkillRuntime = Boolean(input.skillApi)

  if (hasRuntimeSkillCatalog(input)) {
    descriptors.push(...createAgentSkillTools().map(tool => ({
      name: tool.name,
      kind: 'skill' as const,
      tool,
    })))
  }

  for (const adapter of skillAdapters) {
    if (
      !adapter.isAvailable({ context: input.context, services: adapterServices })
      || (requiresRuntimeSkillActivation(input.context, adapter.key, hasSkillRuntime) && !isSkillLoaded(input.loadedSkills, adapter.key))
    ) {
      continue
    }

    availableSkillAdapters.push(adapter)
    descriptors.push(...adapter.createTools({
      context: input.context,
      services: adapterServices,
    }).map(tool => ({
      name: tool.name,
      kind: 'skill' as const,
      tool,
      ownerSkillKey: adapter.key,
    })))
  }

  const tools = descriptors.map(descriptor => descriptor.tool)
  const visibleToolNames = new Set(descriptors.map(descriptor => descriptor.name))
  const visibleSkillToolNames = new Set(
    descriptors
      .filter(descriptor => descriptor.kind === 'skill')
      .map(descriptor => descriptor.name),
  )

  return {
    descriptors,
    tools,
    availableSkillAdapters,
    visibleSkillToolNames,
    hasVisibleTool: toolName => visibleToolNames.has(toolName),
  }
}

export function createRuntimeSkillAdapterServices(input: {
  memoryApi?: AgentMemoryApiClient
  webSearch?: WebSearchClient
}): RuntimeSkillAdapterServices {
  return {
    memoryApi: input.memoryApi,
    webSearch: input.webSearch,
  }
}

export function listRuntimeSkillToolNames(
  skillAdapters: readonly RuntimeSkillAdapter[] = DEFAULT_RUNTIME_SKILL_ADAPTERS,
): readonly string[] {
  return skillAdapters.flatMap(adapter => adapter.toolNames)
}

function hasRuntimeSkillCatalog(input: {
  context: AgentGraphContext | undefined
  skillApi?: AgentSkillApiClient
}): boolean {
  return Boolean(
    input.skillApi
    && input.context?.skillContext
    && input.context.skillContext.availableSkills.length > 0,
  )
}

function requiresRuntimeSkillActivation(
  context: AgentGraphContext | undefined,
  skillKey: string,
  hasSkillRuntime: boolean,
): boolean {
  if (!hasSkillRuntime) {
    return false
  }

  const catalogItem = context?.skillContext?.availableSkills.find(skill => skill.key === skillKey)
  return catalogItem?.activationMode !== AGENT_SKILL_ACTIVATION_MODE.ALWAYS_ON
}
