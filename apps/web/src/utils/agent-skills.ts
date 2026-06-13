import type {
  AgentSkillCard,
} from '@haohaoxue/lexora-contracts/agent'
import type { SvgIconCategoryValue } from '@/components/svg-icon/typing'
import {
  AGENT_MEMORY_SKILL_KEY,
  AGENT_TRANSLATOR_SKILL_KEY,
} from '@haohaoxue/lexora-contracts/agent'

type AgentSkillIconSource = Pick<AgentSkillCard, 'key' | 'category'>

export interface AgentSkillIconRef {
  category: SvgIconCategoryValue
  icon: string
}

export function resolveAgentSkillIcon(skill: AgentSkillIconSource): AgentSkillIconRef {
  if (skill.key === AGENT_MEMORY_SKILL_KEY) {
    return {
      category: 'ui',
      icon: 'memory-note',
    }
  }

  if (skill.key === AGENT_TRANSLATOR_SKILL_KEY) {
    return {
      category: 'ai',
      icon: 'translate',
    }
  }

  const icons: Partial<Record<AgentSkillCard['category'], string>> = {
    memory: 'memory-note',
    productivity: 'document-tree-file',
    knowledge: 'document-tree-file',
    collaboration: 'chat',
    system: 'settings-gear',
  }

  return {
    category: 'ui',
    icon: icons[skill.category] ?? 'document-tree-file',
  }
}
