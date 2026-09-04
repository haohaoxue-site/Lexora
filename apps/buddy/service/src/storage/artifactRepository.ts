import type { DatabaseSync } from 'node:sqlite'
import { withTransaction } from './database'

export type ArtifactKind = 'directory' | 'file'

export interface ArtifactRecord {
  conversationId: string
  createdAt: string
  currentPath: string
  directoryGrantId: string
  directoryRoot: string
  id: string
  kind: ArtifactKind
  mimeType: string
  name: string
  relativePath: string
  sizeBytes: number
  sourceArtifactId: string | null
  updatedAt: string
}

export interface ArtifactRepository {
  findByCurrentPath: (conversationId: string, currentPath: string) => ArtifactRecord | null
  findById: (id: string) => ArtifactRecord | null
  findVisibleById: (id: string) => ArtifactRecord | null
  listForConversation: (conversationId: string) => ArtifactRecord[]
  save: (record: ArtifactRecord) => ArtifactRecord
}

interface ArtifactRow {
  conversation_id: string
  created_at: string
  current_path: string
  directory_grant_id: string
  directory_root: string
  id: string
  kind: ArtifactKind
  mime_type: string
  name: string
  relative_path: string
  size_bytes: number
  source_artifact_id: string | null
  updated_at: string
}

export function createArtifactRepository(database: DatabaseSync): ArtifactRepository {
  const find = database.prepare('SELECT * FROM artifacts WHERE id = ?')
  const findByCurrentPath = database.prepare(`
    SELECT * FROM artifacts
    WHERE conversation_id = ? AND current_path = ?
    LIMIT 1
  `)
  const findVisible = database.prepare(`
    SELECT artifacts.*
    FROM artifacts
    INNER JOIN conversations ON conversations.id = artifacts.conversation_id
    WHERE artifacts.id = ? AND conversations.deleted_at IS NULL
  `)
  const findConversation = database.prepare(`
    SELECT deleted_at FROM conversations WHERE id = ?
  `)
  const insert = database.prepare(`
    INSERT INTO artifacts (
      id, conversation_id, source_artifact_id, current_path,
      directory_grant_id, directory_root, relative_path, kind,
      name, mime_type, size_bytes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const update = database.prepare(`
    UPDATE artifacts
    SET source_artifact_id = ?, current_path = ?, directory_grant_id = ?,
        directory_root = ?, relative_path = ?, kind = ?, name = ?,
        mime_type = ?, size_bytes = ?, updated_at = ?
    WHERE id = ? AND conversation_id = ?
  `)
  const listForConversation = database.prepare(`
    SELECT * FROM artifacts
    WHERE conversation_id = ?
    ORDER BY updated_at, id
  `)

  return {
    findByCurrentPath(conversationId, currentPath) {
      const row = findByCurrentPath.get(conversationId, currentPath) as ArtifactRow | undefined
      return row ? toArtifact(row) : null
    },
    findById(id) {
      const row = find.get(id) as ArtifactRow | undefined
      return row ? toArtifact(row) : null
    },
    findVisibleById(id) {
      const row = findVisible.get(id) as ArtifactRow | undefined
      return row ? toArtifact(row) : null
    },
    listForConversation(conversationId) {
      return (listForConversation.all(conversationId) as unknown as ArtifactRow[])
        .map(toArtifact)
    },
    save(record) {
      return withTransaction(database, () => {
        validateOwnership(record, findConversation, find)
        const existing = find.get(record.id) as ArtifactRow | undefined
        if (existing) {
          const result = update.run(
            record.sourceArtifactId,
            record.currentPath,
            record.directoryGrantId,
            record.directoryRoot,
            record.relativePath,
            record.kind,
            record.name,
            record.mimeType,
            record.sizeBytes,
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
            record.sourceArtifactId,
            record.currentPath,
            record.directoryGrantId,
            record.directoryRoot,
            record.relativePath,
            record.kind,
            record.name,
            record.mimeType,
            record.sizeBytes,
            record.createdAt,
            record.updatedAt,
          )
        }
        return requireArtifact(find.get(record.id), record.id)
      })
    },
  }
}

function validateOwnership(
  record: ArtifactRecord,
  findConversation: ReturnType<DatabaseSync['prepare']>,
  findArtifact: ReturnType<DatabaseSync['prepare']>,
): void {
  const conversation = findConversation.get(record.conversationId) as {
    deleted_at: string | null
  } | undefined
  const source = record.sourceArtifactId
    ? findArtifact.get(record.sourceArtifactId) as ArtifactRow | undefined
    : null
  if (
    conversation?.deleted_at !== null
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
    currentPath: row.current_path,
    directoryGrantId: row.directory_grant_id,
    directoryRoot: row.directory_root,
    id: row.id,
    kind: row.kind,
    mimeType: row.mime_type,
    name: row.name,
    relativePath: row.relative_path,
    sizeBytes: row.size_bytes,
    sourceArtifactId: row.source_artifact_id,
    updatedAt: row.updated_at,
  }
}
