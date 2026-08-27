import { BUDDY_V1_INITIAL_SCHEMA_SQL } from './migrations/v1Initial'

export interface BuddySchemaMigration {
  sql: string
  version: number
}

export const BUDDY_SCHEMA_VERSION = 1 as const

export const BUDDY_SCHEMA_MIGRATIONS: readonly BuddySchemaMigration[] = [
  { sql: BUDDY_V1_INITIAL_SCHEMA_SQL, version: 1 },
]
