import { optionalNonEmptyString, positiveIntegerWithDefault, stringWithDefault } from '@haohaoxue/samepage-shared/zod'
import { z } from 'zod'

const DEFAULT_API_INTERNAL_URL = 'http://127.0.0.1:3000'
const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379'

const agentEnvSchema = z.object({
  API_INTERNAL_URL: stringWithDefault(DEFAULT_API_INTERNAL_URL),
  REDIS_URL: stringWithDefault(DEFAULT_REDIS_URL),
  AGENT_CHECKPOINTER_DATABASE_URL: optionalNonEmptyString(),
  AGENT_CHECKPOINT_RETENTION_DAYS: positiveIntegerWithDefault(7),
})

export type AgentEnv = z.infer<typeof agentEnvSchema>

export function validateAgentEnv(config: Record<string, unknown>): AgentEnv {
  return agentEnvSchema.parse(config)
}
