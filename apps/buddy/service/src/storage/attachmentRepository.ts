import type { DatabaseSync } from 'node:sqlite'

export type AttachmentStatus = 'attached' | 'draft' | 'released'

export interface AttachmentRecord {
  conversationId: string | null
  createdAt: string
  draftKey: string | null
  id: string
  mimeType: string
  name: string
  sizeBytes: number
  status: AttachmentStatus
  storedPath: string
}

export interface AttachmentRepository {
  attach: (ids: readonly string[], conversationId: string) => number
  create: (record: AttachmentRecord) => AttachmentRecord
  findById: (id: string) => AttachmentRecord | null
  listDrafts: () => AttachmentRecord[]
  listForConversation: (conversationId: string) => AttachmentRecord[]
  remove: (id: string) => boolean
  release: (ids: readonly string[]) => number
}

interface AttachmentRow {
  conversation_id: string | null
  created_at: string
  draft_key: string | null
  id: string
  mime_type: string
  name: string
  size_bytes: number
  status: AttachmentStatus
  stored_path: string
}

export function createAttachmentRepository(database: DatabaseSync): AttachmentRepository {
  const find = database.prepare('SELECT * FROM attachments WHERE id = ?')
  const insert = database.prepare(`
    INSERT INTO attachments (
      id, conversation_id, draft_key, stored_path, name, mime_type,
      size_bytes, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const listDrafts = database.prepare(`
    SELECT * FROM attachments WHERE status = 'draft' ORDER BY created_at, id
  `)
  const listForConversation = database.prepare(`
    SELECT * FROM attachments WHERE conversation_id = ? ORDER BY created_at, id
  `)
  const attach = database.prepare(`
    UPDATE attachments SET conversation_id = ?, draft_key = NULL, status = 'attached'
    WHERE id = ? AND status = 'draft'
  `)
  const release = database.prepare(`
    UPDATE attachments SET status = 'released' WHERE id = ? AND status != 'released'
  `)
  const remove = database.prepare('DELETE FROM attachments WHERE id = ?')

  return {
    attach(ids, conversationId) {
      return ids.reduce((count, id) => count + Number(attach.run(conversationId, id).changes), 0)
    },
    create(record) {
      insert.run(
        record.id,
        record.conversationId,
        record.draftKey,
        record.storedPath,
        record.name,
        record.mimeType,
        record.sizeBytes,
        record.status,
        record.createdAt,
      )
      return requireAttachment(find.get(record.id), record.id)
    },
    findById(id) {
      const row = find.get(id) as AttachmentRow | undefined
      return row ? toAttachment(row) : null
    },
    listDrafts() {
      return (listDrafts.all() as unknown as AttachmentRow[]).map(toAttachment)
    },
    listForConversation(conversationId) {
      return (listForConversation.all(conversationId) as unknown as AttachmentRow[])
        .map(toAttachment)
    },
    remove(id) {
      return Number(remove.run(id).changes) === 1
    },
    release(ids) {
      return ids.reduce((count, id) => count + Number(release.run(id).changes), 0)
    },
  }
}

function requireAttachment(value: unknown, id: string): AttachmentRecord {
  const row = value as AttachmentRow | undefined
  if (!row)
    throw new Error(`Lexora Buddy attachment was not persisted: ${id}`)
  return toAttachment(row)
}

function toAttachment(row: AttachmentRow): AttachmentRecord {
  return {
    conversationId: row.conversation_id,
    createdAt: row.created_at,
    draftKey: row.draft_key,
    id: row.id,
    mimeType: row.mime_type,
    name: row.name,
    sizeBytes: row.size_bytes,
    status: row.status,
    storedPath: row.stored_path,
  }
}
