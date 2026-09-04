import type { DatabaseSync } from 'node:sqlite'
import type { BuddySchemaMigration } from './schema'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync as NodeDatabaseSync } from 'node:sqlite'

import {
  BUDDY_SCHEMA_MIGRATIONS,
  BUDDY_SCHEMA_VERSION,
} from './schema'

export const BUDDY_DATABASE_FILE_NAME = 'buddy.sqlite3'

export interface OpenBuddyDatabaseOptions {
  buddyHome?: string
  databasePath?: string
}

export function resolveBuddyHome(homeDirectory = homedir()): string {
  return join(homeDirectory, '.lexora', 'buddy')
}

export function resolveBuddyDatabasePath(buddyHome = resolveBuddyHome()): string {
  return join(buddyHome, BUDDY_DATABASE_FILE_NAME)
}

export function openBuddyDatabase(options: OpenBuddyDatabaseOptions = {}): DatabaseSync {
  const databasePath = options.databasePath ?? resolveBuddyDatabasePath(options.buddyHome)
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
