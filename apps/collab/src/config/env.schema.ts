import { requiredEnvString } from '@haohaoxue/samepage-shared'
import { z } from 'zod'

const collabEnvSchema = z.object({
  DATABASE_URL: requiredEnvString('DATABASE_URL'),
  API_INTERNAL_URL: requiredEnvString('API_INTERNAL_URL'),
  REDIS_URL: requiredEnvString('REDIS_URL'),
})

export type CollabEnv = z.infer<typeof collabEnvSchema>

export function validateCollabEnv(config: Record<string, unknown>): CollabEnv {
  return collabEnvSchema.parse(config)
}
