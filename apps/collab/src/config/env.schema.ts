import { z } from 'zod'

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/samepage_ai'
const DEFAULT_API_INTERNAL_URL = 'http://127.0.0.1:3000/api'
const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379'

const collabEnvSchema = z.object({
  DATABASE_URL: stringWithDefault(DEFAULT_DATABASE_URL),
  API_INTERNAL_URL: stringWithDefault(DEFAULT_API_INTERNAL_URL),
  REDIS_URL: stringWithDefault(DEFAULT_REDIS_URL),
})

export type CollabEnv = z.infer<typeof collabEnvSchema>

export function validateCollabEnv(config: Record<string, unknown>): CollabEnv {
  return collabEnvSchema.parse(config)
}

function stringWithDefault(fallback: string) {
  return z
    .string()
    .trim()
    .optional()
    .transform(value => value?.length ? value : fallback)
}
