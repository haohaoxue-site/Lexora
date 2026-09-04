import type { DatabaseSync } from 'node:sqlite'
import { withTransaction } from './database'

export const ARTIFACT_CHANGE_TYPES = [
  'created',
  'updated',
  'deleted',
  'renamed',
] as const

export type ArtifactChangeType = typeof ARTIFACT_CHANGE_TYPES[number]

export interface ArtifactRecord {
  conversationId: string
  createdAt: string
  createdRunId: string
  currentPath: string
  deletedAt: string | null
  directoryGrantId: string
  directoryRoot: string
  id: string
  lastChangedRunId: string
  mimeType: string
  name: string
  relativePath: string
  sizeBytes: number
  sourceArtifactId: string | null
  sourceToolCallId: string
  updatedAt: string
}

export interface ArtifactChangeRecord {
  artifactId: string
  changeType: ArtifactChangeType
  createdAt: string
  id: string
  previousRelativePath: string | null
  relativePath: string
  runId: string
  sourceToolCallId: string
}

export interface ArtifactRepository {
  findById: (id: string) => ArtifactRecord | null
  findByCurrentPath: (conversationId: string, currentPath: string) => ArtifactRecord | null
  findByLocation: (
    conversationId: string,
    directoryGrantId: string,
    relativePath: string,
  ) => ArtifactRecord | null
  findVisibleById: (id: string) => ArtifactRecord | null
  listChangesForRuns: (runIds: readonly string[]) => ArtifactChangeRecord[]
  listForConversation: (conversationId: string) => ArtifactRecord[]
  saveChange: (input: {
    change: ArtifactChangeRecord
    record: ArtifactRecord
  }) => ArtifactRecord
}

interface ArtifactRow {
  conversation_id: string
  created_at: string
  created_run_id: string
  current_path: string
  deleted_at: string | null
  directory_grant_id: string
  directory_root: string
  id: string
  last_changed_run_id: string
  mime_type: string
  name: string
  relative_path: string
  size_bytes: number
  source_artifact_id: string | null
  source_tool_call_id: string
  updated_at: string
}

interface ArtifactChangeRow {
  artifact_id: string
  change_type: ArtifactChangeType
  created_at: string
  id: string
  previous_relative_path: string | null
  relative_path: string
  run_id: string
  source_tool_call_id: string
}

export function createArtifactRepository(database: DatabaseSync): ArtifactRepository {
  const find = database.prepare('SELECT * FROM artifacts WHERE id = ?')
  const findByCurrentPath = database.prepare(`
    SELECT * FROM artifacts
    WHERE conversation_id = ? AND current_path = ?
    ORDER BY deleted_at IS NULL DESC, updated_at DESC, id DESC
    LIMIT 1
  `)
  const findByLocation = database.prepare(`
    SELECT * FROM artifacts
    WHERE conversation_id = ? AND directory_grant_id = ? AND relative_path = ?
    ORDER BY deleted_at IS NULL DESC, updated_at DESC, id DESC
    LIMIT 1
  `)
  const findVisible = database.prepare(`
    SELECT artifacts.*
    FROM artifacts
    INNER JOIN conversations ON conversations.id = artifacts.conversation_id
    WHERE artifacts.id = ? AND conversations.deleted_at IS NULL
  `)
  const findRunConversation = database.prepare(`
    SELECT runs.conversation_id, conversations.deleted_at
    FROM runs
    INNER JOIN conversations ON conversations.id = runs.conversation_id
    WHERE runs.id = ?
  `)
  const insert = database.prepare(`
    INSERT INTO artifacts (
      id, conversation_id, created_run_id, last_changed_run_id,
      source_tool_call_id, source_artifact_id, current_path,
      directory_grant_id, directory_root, relative_path, name,
      mime_type, size_bytes, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const update = database.prepare(`
    UPDATE artifacts
    SET last_changed_run_id = ?, source_tool_call_id = ?, source_artifact_id = ?,
        current_path = ?, directory_grant_id = ?, directory_root = ?,
        relative_path = ?, name = ?, mime_type = ?, size_bytes = ?,
        deleted_at = ?, updated_at = ?
    WHERE id = ? AND conversation_id = ?
  `)
  const insertChange = database.prepare(`
    INSERT INTO artifact_changes (
      id, artifact_id, run_id, source_tool_call_id, change_type,
      relative_path, previous_relative_path, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const listForConversation = database.prepare(`
    SELECT * FROM artifacts
    WHERE conversation_id = ?
    ORDER BY relative_path, created_at, id
  `)

  return {
    findById(id) {
      const row = find.get(id) as ArtifactRow | undefined
      return row ? toArtifact(row) : null
    },
    findByCurrentPath(conversationId, currentPath) {
      const row = findByCurrentPath.get(conversationId, currentPath) as ArtifactRow | undefined
      return row ? toArtifact(row) : null
    },
    findByLocation(conversationId, directoryGrantId, relativePath) {
      const row = findByLocation.get(
        conversationId,
        directoryGrantId,
        relativePath,
      ) as ArtifactRow | undefined
      return row ? toArtifact(row) : null
    },
    findVisibleById(id) {
      const row = findVisible.get(id) as ArtifactRow | undefined
      return row ? toArtifact(row) : null
    },
    listChangesForRuns(runIds) {
      if (runIds.length === 0)
        return []
      const rows = database.prepare(`
        SELECT artifact_changes.*
        FROM artifact_changes
        INNER JOIN artifacts ON artifacts.id = artifact_changes.artifact_id
        INNER JOIN conversations ON conversations.id = artifacts.conversation_id
        WHERE artifact_changes.run_id IN (${runIds.map(() => '?').join(', ')})
          AND conversations.deleted_at IS NULL
        ORDER BY artifact_changes.created_at, artifact_changes.id
      `).all(...runIds) as unknown as ArtifactChangeRow[]
      return rows.map(toArtifactChange)
    },
    listForConversation(conversationId) {
      return (listForConversation.all(conversationId) as unknown as ArtifactRow[])
        .map(toArtifact)
    },
    saveChange({ change, record }) {
      return withTransaction(database, () => {
        validateOwnership(record, change, findRunConversation, find)
        const existing = find.get(record.id) as ArtifactRow | undefined
        if (existing) {
          const result = update.run(
            record.lastChangedRunId,
            record.sourceToolCallId,
            record.sourceArtifactId,
            record.currentPath,
            record.directoryGrantId,
            record.directoryRoot,
            record.relativePath,
            record.name,
            record.mimeType,
            record.sizeBytes,
            record.deletedAt,
            record.updatedAt,
            record.id,
            record.conversationId,
          )
          if (Number(result.changes) !== 1)
            throw new Error('Lexora Buddy artifact update is invalid')
        }
        else {
          insert.run(
            record.id,
            record.conversationId,
            record.createdRunId,
            record.lastChangedRunId,
            record.sourceToolCallId,
            record.sourceArtifactId,
            record.currentPath,
            record.directoryGrantId,
            record.directoryRoot,
            record.relativePath,
            record.name,
            record.mimeType,
            record.sizeBytes,
            record.deletedAt,
            record.createdAt,
            record.updatedAt,
          )
        }
        insertChange.run(
          change.id,
          change.artifactId,
          change.runId,
          change.sourceToolCallId,
          change.changeType,
          change.relativePath,
          change.previousRelativePath,
          change.createdAt,
        )
        return requireArtifact(find.get(record.id), record.id)
      })
    },
  }
}

function validateOwnership(
  record: ArtifactRecord,
  change: ArtifactChangeRecord,
  findRunConversation: ReturnType<DatabaseSync['prepare']>,
  findArtifact: ReturnType<DatabaseSync['prepare']>,
): void {
  const run = findRunConversation.get(change.runId) as {
    conversation_id: string
    deleted_at: string | null
  } | undefined
  const source = record.sourceArtifactId
    ? findArtifact.get(record.sourceArtifactId) as ArtifactRow | undefined
    : null
  if (
    change.artifactId !== record.id
    || change.runId !== record.lastChangedRunId
    || change.sourceToolCallId !== record.sourceToolCallId
    || run?.conversation_id !== record.conversationId
    || run?.deleted_at !== null
    || (record.sourceArtifactId !== null && source?.conversation_id !== record.conversationId)
  ) {
    throw new Error('Lexora Buddy artifact ownership is invalid')
  }
}

function requireArtifact(value: unknown, id: string): ArtifactRecord {
  const row = value as ArtifactRow | undefined
  if (!row)
    throw new Error(`Lexora Buddy artifact was not persisted: ${id}`)
  return toArtifact(row)
}

function toArtifact(row: ArtifactRow): ArtifactRecord {
  return {
    conversationId: row.conversation_id,
    createdAt: row.created_at,
    createdRunId: row.created_run_id,
    currentPath: row.current_path,
    deletedAt: row.deleted_at,
    directoryGrantId: row.directory_grant_id,
    directoryRoot: row.directory_root,
    id: row.id,
    lastChangedRunId: row.last_changed_run_id,
    mimeType: row.mime_type,
    name: row.name,
    relativePath: row.relative_path,
    sizeBytes: row.size_bytes,
    sourceArtifactId: row.source_artifact_id,
    sourceToolCallId: row.source_tool_call_id,
    updatedAt: row.updated_at,
  }
}

function toArtifactChange(row: ArtifactChangeRow): ArtifactChangeRecord {
  return {
    artifactId: row.artifact_id,
    changeType: row.change_type,
    createdAt: row.created_at,
    id: row.id,
    previousRelativePath: row.previous_relative_path,
    relativePath: row.relative_path,
    runId: row.run_id,
    sourceToolCallId: row.source_tool_call_id,
  }
}
