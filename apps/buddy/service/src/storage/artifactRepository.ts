import type { DatabaseSync } from 'node:sqlite'

export interface ArtifactRecord {
  conversationId: string
  createdAt: string
  id: string
  mimeType: string
  name: string
  runId: string
  sizeBytes: number
  sourceArtifactId: string | null
  sourceToolCallId: string
  storedPath: string
}

export interface ArtifactRepository {
  create: (record: ArtifactRecord) => ArtifactRecord
  deleteByIds: (ids: readonly string[]) => void
  findById: (id: string) => ArtifactRecord | null
  findVisibleById: (id: string) => ArtifactRecord | null
  listForConversation: (conversationId: string) => ArtifactRecord[]
  listForRun: (runId: string) => ArtifactRecord[]
}

interface ArtifactRow {
  conversation_id: string
  created_at: string
  id: string
  mime_type: string
  name: string
  run_id: string
  size_bytes: number
  source_artifact_id: string | null
  source_tool_call_id: string
  stored_path: string
}

export function createArtifactRepository(database: DatabaseSync): ArtifactRepository {
  const find = database.prepare('SELECT * FROM artifacts WHERE id = ?')
  const deleteArtifact = database.prepare('DELETE FROM artifacts WHERE id = ?')
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
      id, conversation_id, run_id, source_tool_call_id, source_artifact_id,
      stored_path, name, mime_type, size_bytes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const listForConversation = database.prepare(`
    SELECT * FROM artifacts
    WHERE conversation_id = ?
    ORDER BY created_at, id
  `)
  const listForRun = database.prepare(`
    SELECT * FROM artifacts WHERE run_id = ? ORDER BY created_at, id
  `)

  return {
    create(record) {
      const run = findRunConversation.get(record.runId) as {
        conversation_id: string
        deleted_at: string | null
      } | undefined
      const source = record.sourceArtifactId
        ? find.get(record.sourceArtifactId) as ArtifactRow | undefined
        : null
      if (
        run?.conversation_id !== record.conversationId
        || run?.deleted_at !== null
        || (record.sourceArtifactId !== null && source?.conversation_id !== record.conversationId)
      ) {
        throw new Error('Lexora Buddy artifact ownership is invalid')
      }
      insert.run(
        record.id,
        record.conversationId,
        record.runId,
        record.sourceToolCallId,
        record.sourceArtifactId,
        record.storedPath,
        record.name,
        record.mimeType,
        record.sizeBytes,
        record.createdAt,
      )
      return requireArtifact(find.get(record.id), record.id)
    },
    deleteByIds(ids) {
      for (const id of ids)
        deleteArtifact.run(id)
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
      return (listForConversation.all(conversationId) as unknown as ArtifactRow[]).map(toArtifact)
    },
    listForRun(runId) {
      return (listForRun.all(runId) as unknown as ArtifactRow[]).map(toArtifact)
    },
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
    id: row.id,
    mimeType: row.mime_type,
    name: row.name,
    runId: row.run_id,
    sizeBytes: row.size_bytes,
    sourceArtifactId: row.source_artifact_id,
    sourceToolCallId: row.source_tool_call_id,
    storedPath: row.stored_path,
  }
}
