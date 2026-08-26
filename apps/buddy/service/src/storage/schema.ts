import { BUDDY_V1_INITIAL_SCHEMA_SQL } from './migrations/v1Initial'
import { BUDDY_V2_EXECUTION_SCHEMA_SQL } from './migrations/v2Execution'
import { BUDDY_V3_AUTOMATION_SCHEMA_SQL } from './migrations/v3Automation'
import { BUDDY_V4_AUTOMATION_PROFILE_SCHEMA_SQL } from './migrations/v4AutomationProfile'
import { BUDDY_V5_AUTOMATION_HISTORY_SCHEMA_SQL } from './migrations/v5AutomationHistory'
import { BUDDY_V6_CONTROLLED_EXECUTION_SCHEMA_SQL } from './migrations/v6ControlledExecution'
import { BUDDY_V7_CONVERSATION_MODEL_SCHEMA_SQL } from './migrations/v7ConversationModel'

export interface BuddySchemaMigration {
  disableForeignKeys?: boolean
  sql: string
  version: number
}

export const BUDDY_SCHEMA_VERSION = 7 as const

export const BUDDY_SCHEMA_MIGRATIONS: readonly BuddySchemaMigration[] = [
  { sql: BUDDY_V1_INITIAL_SCHEMA_SQL, version: 1 },
  { sql: BUDDY_V2_EXECUTION_SCHEMA_SQL, version: 2 },
  { sql: BUDDY_V3_AUTOMATION_SCHEMA_SQL, version: 3 },
  { sql: BUDDY_V4_AUTOMATION_PROFILE_SCHEMA_SQL, version: 4 },
  { sql: BUDDY_V5_AUTOMATION_HISTORY_SCHEMA_SQL, version: 5 },
  {
    disableForeignKeys: true,
    sql: BUDDY_V6_CONTROLLED_EXECUTION_SCHEMA_SQL,
    version: 6,
  },
  { sql: BUDDY_V7_CONVERSATION_MODEL_SCHEMA_SQL, version: 7 },
]
