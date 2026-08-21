import type { DatabaseSync } from 'node:sqlite'

export type NotificationOrigin = 'account' | 'local-runtime' | 'platform-public'

export interface NotificationAttentionRecord {
  notificationId: string
  origin: NotificationOrigin
  kind: string
  revision: string
  seenRevision: string | null
  payload: unknown
  occurredAt: string
  firstObservedAt: string
  lastObservedAt: string
  resolvedAt: string | null
}

export interface ObserveNotificationInput {
  notificationId: string
  origin: NotificationOrigin
  kind: string
  revision: string
  payload: unknown
  occurredAt: string
  observedAt: string
  resolvedAt: string | null
}

export interface NotificationAttentionRepository {
  findById: (notificationId: string) => NotificationAttentionRecord | null
  list: () => NotificationAttentionRecord[]
  markAllSeen: (seenAt: string) => number
  markResolved: (notificationId: string, resolvedAt: string) => boolean
  markSeen: (notificationId: string, revision: string, seenAt: string) => boolean
  observe: (input: ObserveNotificationInput) => NotificationAttentionRecord
  pruneResolvedLocalBefore: (before: string) => number
}

interface NotificationAttentionRow {
  notification_id: string
  origin: NotificationOrigin
  kind: string
  revision: string
  seen_revision: string | null
  payload_json: string
  occurred_at: string
  first_observed_at: string
  last_observed_at: string
  resolved_at: string | null
}

export function createNotificationAttentionRepository(
  database: DatabaseSync,
): NotificationAttentionRepository {
  const find = database.prepare(`
    SELECT * FROM notification_attention_states WHERE notification_id = ?
  `)
  const list = database.prepare(`
    SELECT * FROM notification_attention_states
    ORDER BY occurred_at DESC, notification_id DESC
  `)
  const observe = database.prepare(`
    INSERT INTO notification_attention_states (
      notification_id, origin, kind, revision, seen_revision, payload_json,
      occurred_at, first_observed_at, last_observed_at, resolved_at
    ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
    ON CONFLICT (notification_id) DO UPDATE SET
      origin = excluded.origin,
      kind = excluded.kind,
      revision = excluded.revision,
      payload_json = excluded.payload_json,
      occurred_at = excluded.occurred_at,
      last_observed_at = excluded.last_observed_at,
      resolved_at = CASE
        WHEN excluded.resolved_at IS NULL THEN NULL
        ELSE COALESCE(notification_attention_states.resolved_at, excluded.resolved_at)
      END
  `)
  const markSeen = database.prepare(`
    UPDATE notification_attention_states
    SET seen_revision = revision, last_observed_at = ?
    WHERE notification_id = ? AND revision = ?
  `)
  const markAllSeen = database.prepare(`
    UPDATE notification_attention_states
    SET seen_revision = revision, last_observed_at = ?
    WHERE seen_revision IS NULL OR seen_revision <> revision
  `)
  const markResolved = database.prepare(`
    UPDATE notification_attention_states
    SET resolved_at = COALESCE(resolved_at, ?), last_observed_at = ?
    WHERE notification_id = ?
  `)
  const pruneResolvedLocalBefore = database.prepare(`
    DELETE FROM notification_attention_states
    WHERE origin = 'local-runtime' AND resolved_at IS NOT NULL AND resolved_at < ?
  `)

  return {
    findById(notificationId) {
      const row = find.get(notificationId) as NotificationAttentionRow | undefined
      return row ? toRecord(row) : null
    },
    list() {
      return (list.all() as unknown as NotificationAttentionRow[]).map(toRecord)
    },
    markAllSeen(seenAt) {
      return Number(markAllSeen.run(seenAt).changes)
    },
    markResolved(notificationId, resolvedAt) {
      return Number(markResolved.run(resolvedAt, resolvedAt, notificationId).changes) === 1
    },
    markSeen(notificationId, revision, seenAt) {
      return Number(markSeen.run(seenAt, notificationId, revision).changes) === 1
    },
    observe(input) {
      observe.run(
        input.notificationId,
        input.origin,
        input.kind,
        input.revision,
        JSON.stringify(input.payload),
        input.occurredAt,
        input.observedAt,
        input.observedAt,
        input.resolvedAt,
      )
      return requireRecord(find.get(input.notificationId), input.notificationId)
    },
    pruneResolvedLocalBefore(before) {
      return Number(pruneResolvedLocalBefore.run(before).changes)
    },
  }
}

function requireRecord(value: unknown, notificationId: string): NotificationAttentionRecord {
  const row = value as NotificationAttentionRow | undefined
  if (!row)
    throw new Error(`Lexora Buddy notification attention was not persisted: ${notificationId}`)
  return toRecord(row)
}

function toRecord(row: NotificationAttentionRow): NotificationAttentionRecord {
  return {
    notificationId: row.notification_id,
    origin: row.origin,
    kind: row.kind,
    revision: row.revision,
    seenRevision: row.seen_revision,
    payload: JSON.parse(row.payload_json),
    occurredAt: row.occurred_at,
    firstObservedAt: row.first_observed_at,
    lastObservedAt: row.last_observed_at,
    resolvedAt: row.resolved_at,
  }
}
