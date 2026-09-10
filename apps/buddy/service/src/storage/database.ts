import type { DatabaseSync } from 'node:sqlite'
import type { BuddySchemaMigration } from './schema'
import { mkdirSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { DatabaseSync as NodeDatabaseSync } from 'node:sqlite'

import {
  BUDDY_SCHEMA_MIGRATIONS,
  BUDDY_SCHEMA_VERSION,
} from './schema'

export const BUDDY_DATABASE_FILE_NAME = 'buddy.sqlite3'

export interface OpenBuddyDatabaseOptions {
  databasePath: string
}

const BUDDY_CURRENT_SCHEMA_COLUMNS = {
  command_requests: ['draft_id', 'draft_revision', 'committed_draft_revision'],
  composer_drafts: [
    'id',
    'scope_kind',
    'source_message_id',
    'revision',
    'content_json',
    'model_selection_json',
    'approval_policy',
    'execution_profile',
  ],
  composer_resources: [
    'id',
    'draft_id',
    'state',
    'attachment_id',
    'content_hash',
    'source_json',
    'error_code',
  ],
  conversation_pi_trees: ['conversation_id', 'session_file', 'root_entry_id'],
  run_tree_sources: ['run_id', 'source_run_id', 'position'],
  spaces: ['icon', 'icon_color'],
  turn_requests: ['draft_id', 'draft_revision', 'committed_draft_revision'],
} as const

export function resolveBuddyDatabasePath(buddyHome: string): string {
  return join(buddyHome, BUDDY_DATABASE_FILE_NAME)
}

export function openBuddyDatabase(options: OpenBuddyDatabaseOptions): DatabaseSync {
  if (!options || typeof options !== 'object' || Array.isArray(options))
    throw new TypeError('Buddy database options must be an object')
  const { databasePath } = options
  if (typeof databasePath !== 'string' || (databasePath !== ':memory:' && !isAbsolute(databasePath)))
    throw new TypeError('Buddy database requires an explicit absolute path or :memory:')
  if (databasePath !== ':memory:')
    mkdirSync(dirname(databasePath), { mode: 0o700, recursive: true })

  const database = new NodeDatabaseSync(databasePath)
  try {
    database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
    `)
    migrateBuddyDatabase(database)
    return database
  }
  catch (error) {
    database.close()
    throw error
  }
}

function migrateBuddyDatabase(database: DatabaseSync): void {
  const currentVersion = readSchemaVersion(database)
  if (currentVersion > BUDDY_SCHEMA_VERSION)
    throw new BuddyDatabaseVersionError('newer schema version')
  if (currentVersion === 0 && hasApplicationTables(database))
    throw new BuddyDatabaseVersionError('unversioned schema')

  for (const migration of BUDDY_SCHEMA_MIGRATIONS) {
    if (migration.version <= currentVersion)
      continue
    applyMigration(database, migration)
  }
  assertCurrentSchema(database)
}

function assertCurrentSchema(database: DatabaseSync): void {
  for (const [table, requiredColumns] of Object.entries(BUDDY_CURRENT_SCHEMA_COLUMNS)) {
    const columns = new Set((database.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string
    }>).map(column => column.name))
    if (requiredColumns.some(column => !columns.has(column)))
      throw new BuddyDatabaseVersionError('incomplete schema version')
  }
}

function applyMigration(database: DatabaseSync, migration: BuddySchemaMigration): void {
  const suspendForeignKeys = migration.foreignKeys === 'off'
  if (suspendForeignKeys)
    database.exec('PRAGMA foreign_keys = OFF')
  try {
    withTransaction(database, () => {
      database.exec(migration.sql)
      if (suspendForeignKeys)
        assertForeignKeysIntact(database)
      database.exec(`PRAGMA user_version = ${migration.version}`)
    })
  }
  finally {
    if (suspendForeignKeys)
      database.exec('PRAGMA foreign_keys = ON')
  }
}

function assertForeignKeysIntact(database: DatabaseSync): void {
  const violations = database.prepare('PRAGMA foreign_key_check').all()
  if (violations.length > 0)
    throw new BuddyDatabaseVersionError('inconsistent schema after migration')
}

function readSchemaVersion(database: DatabaseSync): number {
  const row = database.prepare('PRAGMA user_version').get() as { user_version: number }
  return row.user_version
}

function hasApplicationTables(database: DatabaseSync): boolean {
  const row = database.prepare(`
    SELECT COUNT(*) AS count
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).get() as { count: number }
  return row.count > 0
}

export class BuddyDatabaseVersionError extends Error {
  constructor(reason: string) {
    super(`Lexora Buddy database uses an ${reason}`)
    this.name = 'BuddyDatabaseVersionError'
  }
}

export function withTransaction<T>(database: DatabaseSync, operation: () => T): T {
  database.exec('BEGIN IMMEDIATE')
  try {
    const result = operation()
    database.exec('COMMIT')
    return result
  }
  catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}
