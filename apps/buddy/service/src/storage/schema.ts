import { BUDDY_V1_INITIAL_SCHEMA_SQL } from './migrations/v1Initial'
import { BUDDY_V2_CHANGE_SCHEMA_SQL } from './migrations/v2Change'
import { BUDDY_V3_SPACE_SCHEMA_SQL } from './migrations/v3Space'
import { BUDDY_V4_SPACE_SCHEMA_SQL } from './migrations/v4Space'
import { BUDDY_V5_ARTIFACT_SCHEMA_SQL } from './migrations/v5Artifact'
import { BUDDY_V6_PERMISSION_SCHEMA_SQL } from './migrations/v6Permission'

export interface BuddySchemaMigration {
  foreignKeys?: 'off'
  sql: string
  version: number
}

export const BUDDY_SCHEMA_VERSION = 6 as const

export const BUDDY_SCHEMA_MIGRATIONS: readonly BuddySchemaMigration[] = [
  { sql: BUDDY_V1_INITIAL_SCHEMA_SQL, version: 1 },
  { sql: BUDDY_V2_CHANGE_SCHEMA_SQL, version: 2 },
  { sql: BUDDY_V3_SPACE_SCHEMA_SQL, version: 3 },
  { sql: BUDDY_V4_SPACE_SCHEMA_SQL, version: 4 },
  { sql: BUDDY_V5_ARTIFACT_SCHEMA_SQL, version: 5 },
  { foreignKeys: 'off', sql: BUDDY_V6_PERMISSION_SCHEMA_SQL, version: 6 },
]
