import process from 'node:process'
import { z } from 'zod'

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform(value => value?.length ? value : undefined)

const envSchema = z.object({
  DATABASE_URL: z.string().trim().default('postgresql://postgres:postgres@localhost:5432/samepage_ai'),
  APP_SECRET: z.string().trim().min(32, 'APP_SECRET 至少需要 32 个字符'),
  REDIS_URL: z.string().trim().default('redis://127.0.0.1:6379'),
  OAUTH_PROXY_URL: optionalString,
  GITHUB_CLIENT_ID: optionalString,
  GITHUB_CLIENT_SECRET: optionalString,
  LINUX_DO_CLIENT_ID: optionalString,
  LINUX_DO_CLIENT_SECRET: optionalString,
  STORAGE_ENDPOINT: z.string().trim().default('http://127.0.0.1:9000'),
  STORAGE_ACCESS_KEY: z.string().trim().min(3, 'STORAGE_ACCESS_KEY 至少需要 3 个字符'),
  STORAGE_SECRET_KEY: z.string().trim().min(8, 'STORAGE_SECRET_KEY 至少需要 8 个字符'),
  SYSTEM_ADMIN: z
    .string()
    .trim()
    .toLowerCase()
    .email(),
})

export type AppEnv = z.infer<typeof envSchema>

export function validateEnv(config: Record<string, unknown>): AppEnv {
  return envSchema.parse(config)
}

let cachedEnv: AppEnv | undefined

export function getEnv(): AppEnv {
  cachedEnv ??= envSchema.parse(process.env)
  return cachedEnv
}
