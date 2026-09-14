import type { DatabaseSync } from 'node:sqlite'
import type { SkillOrigin } from '../../../shared/skills/skillApi'
import { dirname } from 'node:path'
import { skillOriginSchema } from '../../../shared/skills/skillApi'
import { withTransaction } from './database'

export interface SkillInstallation {
  id: string
  name: string
  spaceId: string | null
  managedBy: 'application' | 'user' | 'external'
  path: string
  description: string
  enabled: boolean
  origin: SkillOrigin
  revision: string
  createdAt: string
  updatedAt: string
}

interface SkillRow {
  id: string
  name: string
  space_id: string | null
  managed_by: SkillInstallation['managedBy']
  path: string
  description: string
  enabled: number
  origin_json: string
  revision: string
  created_at: string
  updated_at: string
}

export function createSkillRepository(database: DatabaseSync) {
  const list = database.prepare('SELECT * FROM skill_installations ORDER BY name, id')
  const upsert = database.prepare(`
    INSERT INTO skill_installations (id, name, scope_key, space_id, managed_by, path, description, enabled, origin_json, revision, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, path=excluded.path, description=excluded.description,
      enabled=excluded.enabled, origin_json=excluded.origin_json, revision=excluded.revision, updated_at=excluded.updated_at
  `)
  function save(record: SkillInstallation) {
    upsert.run(record.id, record.name, record.spaceId ?? '', record.spaceId, record.managedBy, record.path, record.description, Number(record.enabled), JSON.stringify(record.origin), record.revision, record.createdAt, record.updatedAt)
  }
  function scheduleCleanup(spaceId: string | null, installationId: string, path: string) {
    database.prepare('INSERT OR IGNORE INTO skill_file_cleanup (path, space_id, installation_id) VALUES (?, ?, ?)').run(path, spaceId, installationId)
  }
  function completeCleanup(path: string) {
    database.prepare('DELETE FROM skill_file_cleanup WHERE path = ?').run(path)
  }
  return {
    scheduleCleanup,
    completeCleanup,
    pendingCleanup: () => (database.prepare('SELECT * FROM skill_file_cleanup').all() as { path: string, space_id: string | null, installation_id: string }[])
      .map(row => ({ path: row.path, spaceId: row.space_id, installationId: row.installation_id })),
    list: (): SkillInstallation[] => (list.all() as unknown as SkillRow[]).map(row => ({
      id: row.id,
      name: row.name,
      spaceId: row.space_id,
      managedBy: row.managed_by,
      path: row.path,
      description: row.description,
      enabled: Boolean(row.enabled),
      origin: skillOriginSchema.parse(JSON.parse(row.origin_json)),
      revision: row.revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    save,
    saveAll: (records: readonly SkillInstallation[]) => withTransaction(database, () => {
      for (const record of records) {
        const previous = database.prepare('SELECT path FROM skill_installations WHERE id = ?').get(record.id) as { path: string } | undefined
        if (previous && previous.path !== record.path)
          scheduleCleanup(record.spaceId, record.id, dirname(dirname(previous.path)))
        save(record)
        completeCleanup(dirname(dirname(record.path)))
      }
    }),
    remove: (id: string) => withTransaction(database, () => {
      const record = database.prepare('SELECT * FROM skill_installations WHERE id = ?').get(id) as unknown as SkillRow | undefined
      if (record?.managed_by === 'user')
        scheduleCleanup(record.space_id, record.id, dirname(dirname(record.path)))
      database.prepare('DELETE FROM skill_installations WHERE id = ?').run(id)
    }),
    hasActiveRuns(spaceId: string | null): boolean {
      return Boolean(database.prepare(`SELECT 1 FROM runs JOIN conversations ON conversations.id = runs.conversation_id
        WHERE runs.status IN ('queued', 'running') AND (? IS NULL OR conversations.space_id = ?) LIMIT 1`).get(spaceId, spaceId))
    },
  }
}

export type SkillRepository = ReturnType<typeof createSkillRepository>
