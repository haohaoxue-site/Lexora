import process from 'node:process'
import { validateAgentEnv } from './env.schema'

const DEFAULT_AGENT_HOST = '0.0.0.0'
const DEFAULT_AGENT_PORT = 4200
const DEFAULT_AGENT_RUN_TIMEOUT_MS = 60_000
const DEFAULT_AGENT_MAX_CONCURRENT_RUNS = 8
const DEFAULT_AGENT_CHECKPOINTER_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/samepage_ai'

/** apps/agent 运行配置。 */
export interface AgentConfig {
  host: string
  port: number
  logger: AgentLoggerConfig
  apiInternalUrl: string
  redisUrl: string
  runTimeoutMs: number
  maxConcurrentRuns: number
  checkpointer: AgentCheckpointerConfig
}

/** apps/agent 日志配置。 */
export interface AgentLoggerConfig {
  level: string
  pretty: boolean
}

export interface AgentCheckpointerConfig {
  databaseUrl: string
  retentionDays: number
}

type EnvSource = Record<string, string | undefined>

export function loadAgentConfig(env: EnvSource = process.env): AgentConfig {
  const agentEnv = validateAgentEnv(env)

  return {
    host: DEFAULT_AGENT_HOST,
    port: DEFAULT_AGENT_PORT,
    logger: readLoggerConfig(env),
    apiInternalUrl: agentEnv.API_INTERNAL_URL,
    redisUrl: agentEnv.REDIS_URL,
    runTimeoutMs: DEFAULT_AGENT_RUN_TIMEOUT_MS,
    maxConcurrentRuns: DEFAULT_AGENT_MAX_CONCURRENT_RUNS,
    checkpointer: readCheckpointerConfig(env, agentEnv),
  }
}

function readLoggerConfig(env: EnvSource): AgentLoggerConfig {
  const isProduction = env.NODE_ENV === 'production'

  return {
    level: isProduction ? 'info' : 'debug',
    pretty: !isProduction,
  }
}

function readCheckpointerConfig(env: EnvSource, agentEnv: ReturnType<typeof validateAgentEnv>): AgentCheckpointerConfig {
  const isProduction = env.NODE_ENV === 'production'
  const databaseUrl = agentEnv.AGENT_CHECKPOINTER_DATABASE_URL
    ?? (isProduction ? null : DEFAULT_AGENT_CHECKPOINTER_DATABASE_URL)

  if (!databaseUrl) {
    throw new Error('AGENT_CHECKPOINTER_DATABASE_URL 是 Postgres checkpointer 的必填配置')
  }

  return {
    databaseUrl,
    retentionDays: agentEnv.AGENT_CHECKPOINT_RETENTION_DAYS,
  }
}
