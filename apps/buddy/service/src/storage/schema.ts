import { BUDDY_V1_INITIAL_SCHEMA_SQL } from './migrations/v1Initial'
import { BUDDY_V2_CHANGE_SCHEMA_SQL } from './migrations/v2Change'

export interface BuddySchemaMigration {
  sql: string
  version: number
}

export const BUDDY_SCHEMA_VERSION = 2 as const

export const BUDDY_SCHEMA_MIGRATIONS: readonly BuddySchemaMigration[] = [
  { sql: BUDDY_V1_INITIAL_SCHEMA_SQL, version: 1 },
  { sql: BUDDY_V2_CHANGE_SCHEMA_SQL, version: 2 },
]
