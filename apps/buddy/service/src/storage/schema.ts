import { BUDDY_V5_INITIAL_SCHEMA_SQL } from './migrations/v5Initial'
import { BUDDY_V6_RUN_INPUTS_SQL } from './migrations/v6RunInputs'
import { BUDDY_V7_COMMAND_REQUESTS_SQL } from './migrations/v7CommandRequests'
import { BUDDY_V8_USAGE_EVENT_OUTBOX_SQL } from './migrations/v8UsageEventOutbox'
import { BUDDY_V9_EVENT_FIRST_USAGE_SQL } from './migrations/v9EventFirstUsage'
import { BUDDY_V10_PROJECTS_SQL } from './migrations/v10Projects'
import { BUDDY_V11_PROVIDERS_SQL } from './migrations/v11Providers'
import { BUDDY_V12_MODEL_ATTENTION_SQL } from './migrations/v12ModelAttention'
import { BUDDY_V13_NOTIFICATION_SQL } from './migrations/v13Notification'
import { BUDDY_V14_PROVIDER_DESCRIPTIONS_SQL } from './migrations/v14ProviderDescriptions'
import { BUDDY_V15_DEFAULT_MODEL_REASONING_SQL } from './migrations/v15DefaultModelReasoning'

export interface BuddySchemaMigration {
  sql: string
  version: number
}

export const BUDDY_SCHEMA_VERSION = 15 as const
export const BUDDY_MINIMUM_UPGRADABLE_VERSION = 4 as const

export const BUDDY_SCHEMA_MIGRATIONS: readonly BuddySchemaMigration[] = [
  { sql: BUDDY_V5_INITIAL_SCHEMA_SQL, version: 5 },
  { sql: BUDDY_V6_RUN_INPUTS_SQL, version: 6 },
  { sql: BUDDY_V7_COMMAND_REQUESTS_SQL, version: 7 },
  { sql: BUDDY_V8_USAGE_EVENT_OUTBOX_SQL, version: 8 },
  { sql: BUDDY_V9_EVENT_FIRST_USAGE_SQL, version: 9 },
  { sql: BUDDY_V10_PROJECTS_SQL, version: 10 },
  { sql: BUDDY_V11_PROVIDERS_SQL, version: 11 },
  { sql: BUDDY_V12_MODEL_ATTENTION_SQL, version: 12 },
  { sql: BUDDY_V13_NOTIFICATION_SQL, version: 13 },
  { sql: BUDDY_V14_PROVIDER_DESCRIPTIONS_SQL, version: 14 },
  { sql: BUDDY_V15_DEFAULT_MODEL_REASONING_SQL, version: 15 },
]
