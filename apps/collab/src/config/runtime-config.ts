import process from 'node:process'
import { validateCollabEnv } from './env.schema'

const DEFAULT_COLLAB_HOST = '0.0.0.0'
const DEFAULT_COLLAB_PORT = 4100
const DEFAULT_COLLAB_MAX_CONNECTIONS = 1_000
const DEFAULT_COLLAB_HANDSHAKE_RATE_LIMIT_MAX = 120
const DEFAULT_COLLAB_HANDSHAKE_RATE_LIMIT_WINDOW_MS = 60_000
const DEFAULT_COLLAB_MAX_UPDATE_BYTES = 1024 * 1024

/** apps/collab 运行配置。 */
export interface CollabConfig {
  host: string
  port: number
  logger: CollabLoggerConfig
  databaseUrl: string
  apiInternalUrl: string
  appInternalKey: string
  redisUrl: string
  maxConnections: number
  handshakeRateLimitMax: number
  handshakeRateLimitWindowMs: number
  maxUpdateBytes: number
}

/** apps/collab 日志配置。 */
export interface CollabLoggerConfig {
  level: string
  pretty: boolean
}

type EnvSource = Record<string, string | undefined>

export function loadCollabConfig(env: EnvSource = process.env): CollabConfig {
  const collabEnv = validateCollabEnv(env)

  return {
    host: DEFAULT_COLLAB_HOST,
    port: DEFAULT_COLLAB_PORT,
    logger: readLoggerConfig(env),
    databaseUrl: collabEnv.DATABASE_URL,
    apiInternalUrl: collabEnv.API_INTERNAL_URL,
    appInternalKey: collabEnv.APP_INTERNAL_KEY,
    redisUrl: collabEnv.REDIS_URL,
    maxConnections: DEFAULT_COLLAB_MAX_CONNECTIONS,
    handshakeRateLimitMax: DEFAULT_COLLAB_HANDSHAKE_RATE_LIMIT_MAX,
    handshakeRateLimitWindowMs: DEFAULT_COLLAB_HANDSHAKE_RATE_LIMIT_WINDOW_MS,
    maxUpdateBytes: DEFAULT_COLLAB_MAX_UPDATE_BYTES,
  }
}

function readLoggerConfig(env: EnvSource): CollabLoggerConfig {
  const isProduction = env.NODE_ENV === 'production'

  return {
    level: isProduction ? 'info' : 'debug',
    pretty: !isProduction,
  }
}
