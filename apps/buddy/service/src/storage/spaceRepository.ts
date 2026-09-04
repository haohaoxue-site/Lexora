import type { DatabaseSync } from 'node:sqlite'
import { withTransaction } from './database'

export type SpaceMemoryScope = 'personal_and_space' | 'space_only'

interface SpaceDirectoryBindingRecordBase {
  accessGrantedAt: string
  canonicalRoot: string
  createdAt: string
  id: string
  revision: number
  revokedAt: string | null
  root: string
  spaceId: string
  updatedAt: string
}

export interface SpacePrimaryDirectoryBindingRecord extends SpaceDirectoryBindingRecordBase {
  resourcesTrustedAt: string
}

export type SpaceAdditionalDirectoryBindingRecord = SpaceDirectoryBindingRecordBase

export interface SpaceRecord {
  activeRunCount: number
  additionalDirectories: readonly SpaceAdditionalDirectoryBindingRecord[]
  createdAt: string
  id: string
  memoryScope: SpaceMemoryScope
  name: string
  primaryDirectory: SpacePrimaryDirectoryBindingRecord | null
  revokedAt: string | null
  updatedAt: string
}

interface PersistedSpaceDirectoryInputBase {
  accessGrantedAt: string
  canonicalRoot: string
  id: string
  root: string
}

export interface PersistedSpacePrimaryDirectoryInput extends PersistedSpaceDirectoryInputBase {
  resourcesTrustedAt: string
}

export type PersistedSpaceAdditionalDirectoryInput = PersistedSpaceDirectoryInputBase

export interface CreateSpaceRecordInput {
  additionalDirectories: readonly PersistedSpaceAdditionalDirectoryInput[]
  createdAt: string
  id: string
  memoryScope: SpaceMemoryScope
  name: string
  primaryDirectory: PersistedSpacePrimaryDirectoryInput | null
}

export interface SpaceEventInput {
  createdAt: string
  eventType: 'space.config.updated' | 'space.deleted'
  id: string
  payload: unknown
  spaceId: string
}

export interface UpdateSpaceRecordInput {
  additionalDirectories: readonly PersistedSpaceAdditionalDirectoryInput[]
  event: SpaceEventInput
  id: string
  memoryScope: SpaceMemoryScope
  name: string
  primaryDirectory: PersistedSpacePrimaryDirectoryInput | null
  updatedAt: string
}

export interface SpaceRepository {
  create: (input: CreateSpaceRecordInput) => SpaceRecord
  delete: (id: string, deletedAt: string, event: SpaceEventInput) => SpaceRecord
  findById: (id: string) => SpaceRecord | null
  hasActiveRuns: (id: string) => boolean
  list: () => SpaceRecord[]
  update: (input: UpdateSpaceRecordInput) => SpaceRecord
}

interface SpaceRow {
  active_run_count: number
  created_at: string
  id: string
  memory_scope: SpaceMemoryScope
  name: string
  revoked_at: string | null
  updated_at: string
}

interface SpaceDirectoryBindingRow {
  access_granted_at: string
  canonical_root: string
  created_at: string
  id: string
  is_primary: number
  resources_trusted_at: string | null
  revision: number
  revoked_at: string | null
  root: string
  space_id: string
  updated_at: string
}

interface PersistedSpaceDirectoryWithRole extends PersistedSpaceDirectoryInputBase {
  isPrimary: boolean
  resourcesTrustedAt: string | null
}

export function createSpaceRepository(database: DatabaseSync): SpaceRepository {
  const spaceSelection = `
    SELECT
      spaces.*,
      (
        SELECT COUNT(*)
        FROM conversations
        WHERE conversations.space_id = spaces.id
          AND EXISTS (
            SELECT 1 FROM runs
            WHERE runs.conversation_id = conversations.id
              AND runs.status IN ('queued', 'running')
          )
      ) AS active_run_count
    FROM spaces
  `
  const find = database.prepare(`${spaceSelection} WHERE spaces.id = ?`)
  const list = database.prepare(`${spaceSelection} ORDER BY spaces.name, spaces.id`)
  const listDirectories = database.prepare(`
    SELECT * FROM space_directory_bindings
    WHERE space_id = ? AND revoked_at IS NULL
    ORDER BY is_primary DESC, created_at, id
  `)
  const create = database.prepare(`
    INSERT INTO spaces (
      id, name, memory_scope, revoked_at, created_at, updated_at
    ) VALUES (?, ?, ?, NULL, ?, ?)
  `)
  const insertDirectory = database.prepare(`
    INSERT INTO space_directory_bindings (
      id, space_id, root, canonical_root, access_granted_at,
      resources_trusted_at, is_primary, revision, revoked_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)
  `)
  const updateDirectory = database.prepare(`
    UPDATE space_directory_bindings
    SET resources_trusted_at = ?, is_primary = ?, revision = revision + 1, updated_at = ?
    WHERE id = ? AND space_id = ? AND revoked_at IS NULL
  `)
  const revokeDirectory = database.prepare(`
    UPDATE space_directory_bindings
    SET resources_trusted_at = NULL, is_primary = 0,
        revision = revision + 1, revoked_at = ?, updated_at = ?
    WHERE id = ? AND space_id = ? AND revoked_at IS NULL
  `)
  const updateSpace = database.prepare(`
    UPDATE spaces
    SET name = ?, memory_scope = ?, updated_at = ?
    WHERE id = ? AND revoked_at IS NULL
  `)
  const deleteSpace = database.prepare(`
    UPDATE spaces SET revoked_at = ?, updated_at = ?
    WHERE id = ? AND revoked_at IS NULL
  `)
  const revokeSpaceDirectories = database.prepare(`
    UPDATE space_directory_bindings
    SET resources_trusted_at = NULL, is_primary = 0,
        revision = revision + 1, revoked_at = ?, updated_at = ?
    WHERE space_id = ? AND revoked_at IS NULL
  `)
  const insertEvent = database.prepare(`
    INSERT INTO space_events (id, space_id, event_type, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)
  const findActiveRun = database.prepare(`
    SELECT 1
    FROM conversations
    INNER JOIN runs ON runs.conversation_id = conversations.id
    WHERE conversations.space_id = ? AND runs.status IN ('queued', 'running')
    LIMIT 1
  `)

  const readDirectoryRows = (spaceId: string): SpaceDirectoryBindingRow[] => {
    return listDirectories.all(spaceId) as unknown as SpaceDirectoryBindingRow[]
  }
  const readSpace = (id: string): SpaceRecord | null => {
    const row = find.get(id) as SpaceRow | undefined
    return row ? toSpace(row, readDirectoryRows(id)) : null
  }

  return {
    create(input) {
      return withTransaction(database, () => {
        validateDirectorySet(input.primaryDirectory, input.additionalDirectories)
        create.run(
          input.id,
          input.name,
          toStorageMemoryScope(input.memoryScope),
          input.createdAt,
          input.createdAt,
        )
        const directories = withDirectoryRoles(input.primaryDirectory, input.additionalDirectories)
        for (const directory of directories)
          persistNewDirectory(insertDirectory, input.id, directory, input.createdAt)
        return requireSpace(readSpace(input.id), input.id)
      })
    },
    delete(id, deletedAt, event) {
      return withTransaction(database, () => {
        if (Number(deleteSpace.run(deletedAt, deletedAt, id).changes) !== 1)
          throw new Error(`Lexora Buddy space was not deleted: ${id}`)
        revokeSpaceDirectories.run(deletedAt, deletedAt, id)
        persistSpaceEvent(insertEvent, event)
        return requireSpace(readSpace(id), id)
      })
    },
    findById: readSpace,
    hasActiveRuns(id) {
      return Boolean(findActiveRun.get(id))
    },
    list() {
      return (list.all() as unknown as SpaceRow[])
        .map(row => toSpace(row, readDirectoryRows(row.id)))
    },
    update(input) {
      return withTransaction(database, () => {
        validateDirectorySet(input.primaryDirectory, input.additionalDirectories)
        const directories = withDirectoryRoles(input.primaryDirectory, input.additionalDirectories)
        const current = readDirectoryRows(input.id)
        const currentById = new Map(current.map(directory => [directory.id, { ...directory }]))
        const nextIds = new Set(directories.map(directory => directory.id))
        for (const directory of current) {
          if (nextIds.has(directory.id))
            continue
          revokeDirectory.run(input.updatedAt, input.updatedAt, directory.id, input.id)
          currentById.delete(directory.id)
        }
        const currentPrimary = [...currentById.values()].find(directory => directory.is_primary === 1)
        const nextPrimary = directories.find(directory => directory.isPrimary)
        if (currentPrimary && currentPrimary.id !== nextPrimary?.id) {
          if (Number(updateDirectory.run(
            null,
            0,
            input.updatedAt,
            currentPrimary.id,
            input.id,
          ).changes) !== 1) {
            throw new Error(`Lexora Buddy space directory was not updated: ${currentPrimary.id}`)
          }
          currentPrimary.is_primary = 0
          currentPrimary.resources_trusted_at = null
        }
        for (const directory of directories) {
          const existing = currentById.get(directory.id)
          if (!existing) {
            persistNewDirectory(insertDirectory, input.id, directory, input.updatedAt)
            continue
          }
          if (
            existing.root !== directory.root
            || existing.canonical_root !== directory.canonicalRoot
            || existing.access_granted_at !== directory.accessGrantedAt
          ) {
            throw new Error(`Lexora Buddy space directory identity changed: ${directory.id}`)
          }
          if (
            (existing.is_primary === 1) !== directory.isPrimary
            || existing.resources_trusted_at !== directory.resourcesTrustedAt
          ) {
            if (Number(updateDirectory.run(
              directory.resourcesTrustedAt,
              directory.isPrimary ? 1 : 0,
              input.updatedAt,
              directory.id,
              input.id,
            ).changes) !== 1) {
              throw new Error(`Lexora Buddy space directory was not updated: ${directory.id}`)
            }
          }
        }
        if (Number(updateSpace.run(
          input.name,
          toStorageMemoryScope(input.memoryScope),
          input.updatedAt,
          input.id,
        ).changes) !== 1) {
          throw new Error(`Lexora Buddy space was not updated: ${input.id}`)
        }
        persistSpaceEvent(insertEvent, input.event)
        return requireSpace(readSpace(input.id), input.id)
      })
    },
  }
}

function persistNewDirectory(
  statement: ReturnType<DatabaseSync['prepare']>,
  spaceId: string,
  directory: PersistedSpaceDirectoryWithRole,
  timestamp: string,
): void {
  statement.run(
    directory.id,
    spaceId,
    directory.root,
    directory.canonicalRoot,
    directory.accessGrantedAt,
    directory.resourcesTrustedAt,
    directory.isPrimary ? 1 : 0,
    timestamp,
    timestamp,
  )
}

function persistSpaceEvent(
  statement: ReturnType<DatabaseSync['prepare']>,
  event: SpaceEventInput,
): void {
  statement.run(
    event.id,
    event.spaceId,
    event.eventType,
    JSON.stringify(event.payload),
    event.createdAt,
  )
}

function validateDirectorySet(
  primaryDirectory: PersistedSpacePrimaryDirectoryInput | null,
  additionalDirectories: readonly PersistedSpaceAdditionalDirectoryInput[],
): void {
  const directories = [
    ...(primaryDirectory ? [primaryDirectory] : []),
    ...additionalDirectories,
  ]
  if (directories.length > 32)
    throw new Error('Lexora Buddy space has too many directory bindings')
  if (new Set(directories.map(directory => directory.id)).size !== directories.length)
    throw new Error('Lexora Buddy space has duplicate directory bindings')
  if (new Set(directories.map(directory => directory.canonicalRoot)).size !== directories.length)
    throw new Error('Lexora Buddy space has duplicate directory roots')
}

function requireSpace(value: SpaceRecord | null, id: string): SpaceRecord {
  if (!value)
    throw new Error(`Lexora Buddy space was not persisted: ${id}`)
  return value
}

function toSpace(
  row: SpaceRow,
  directories: readonly SpaceDirectoryBindingRow[],
): SpaceRecord {
  const primaryDirectory = directories.find(directory => directory.is_primary === 1) ?? null
  return {
    activeRunCount: row.active_run_count,
    additionalDirectories: directories
      .filter(directory => directory.is_primary !== 1)
      .map(toSpaceAdditionalDirectoryBinding),
    createdAt: row.created_at,
    id: row.id,
    memoryScope: row.memory_scope,
    name: row.name,
    primaryDirectory: primaryDirectory
      ? toSpacePrimaryDirectoryBinding(primaryDirectory)
      : null,
    revokedAt: row.revoked_at,
    updatedAt: row.updated_at,
  }
}

function toSpacePrimaryDirectoryBinding(
  row: SpaceDirectoryBindingRow,
): SpacePrimaryDirectoryBindingRecord {
  return {
    accessGrantedAt: row.access_granted_at,
    canonicalRoot: row.canonical_root,
    createdAt: row.created_at,
    id: row.id,
    resourcesTrustedAt: requirePrimaryDirectoryTrust(row),
    revision: row.revision,
    revokedAt: row.revoked_at,
    root: row.root,
    spaceId: row.space_id,
    updatedAt: row.updated_at,
  }
}

function toSpaceAdditionalDirectoryBinding(
  row: SpaceDirectoryBindingRow,
): SpaceAdditionalDirectoryBindingRecord {
  return {
    accessGrantedAt: row.access_granted_at,
    canonicalRoot: row.canonical_root,
    createdAt: row.created_at,
    id: row.id,
    revision: row.revision,
    revokedAt: row.revoked_at,
    root: row.root,
    spaceId: row.space_id,
    updatedAt: row.updated_at,
  }
}

function requirePrimaryDirectoryTrust(row: SpaceDirectoryBindingRow): string {
  if (!row.resources_trusted_at)
    throw new Error(`Lexora Buddy primary directory resources are not trusted: ${row.id}`)
  return row.resources_trusted_at
}

function withDirectoryRoles(
  primaryDirectory: PersistedSpacePrimaryDirectoryInput | null,
  additionalDirectories: readonly PersistedSpaceAdditionalDirectoryInput[],
): PersistedSpaceDirectoryWithRole[] {
  return [
    ...(primaryDirectory
      ? [{ ...primaryDirectory, isPrimary: true }]
      : []),
    ...additionalDirectories.map(directory => ({
      ...directory,
      isPrimary: false,
      resourcesTrustedAt: null,
    })),
  ]
}

function toStorageMemoryScope(
  scope: SpaceMemoryScope,
): SpaceRow['memory_scope'] {
  return scope
}
