import { registerAs } from '@nestjs/config'
import { getEnv } from './env.schema'

export interface AgentSkillsConfig {
  rootDir: string
}

export const agentSkillsConfig = registerAs('agentSkills', (): AgentSkillsConfig => ({
  rootDir: getEnv().AGENT_SKILLS_ROOT ?? '/srv/agent-skills',
}))
