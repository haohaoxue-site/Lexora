import type { DatabaseSync } from 'node:sqlite'
import { withTransaction } from './database'

export type ProjectMemoryScope = 'personal_and_project' | 'project_only'

export interface ProjectRecord {
  activeRunCount: number
  canonicalRoot: string
  createdAt: string
  id: string
  instructions: string
  memoryScope: ProjectMemoryScope
  name: string
  revokedAt: string | null
  root: string
  updatedAt: string
}

export interface CreateProjectRecordInput {
  authorizedAt: string
  directory: {
    canonicalRoot: string
    root: string
  }
  id: string
  instructions: string
  memoryScope: ProjectMemoryScope
  name: string
}

export interface ProjectEventInput {
  createdAt: string
  eventType: 'project.config.updated' | 'project.deleted'
  id: string
  payload: unknown
  projectId: string
}

export interface UpdateProjectRecordInput {
  directory: {
    canonicalRoot: string
    root: string
  }
  event: ProjectEventInput
  id: string
  instructions: string
  memoryScope: ProjectMemoryScope
  name: string
  updatedAt: string
}

export interface ProjectRepository {
  create: (input: CreateProjectRecordInput) => ProjectRecord
  delete: (id: string, deletedAt: string, event: ProjectEventInput) => ProjectRecord
  findById: (id: string) => ProjectRecord | null
  hasActiveRuns: (id: string) => boolean
  list: () => ProjectRecord[]
  update: (input: UpdateProjectRecordInput) => ProjectRecord
}

interface ProjectRow {
  active_run_count: number
  canonical_root: string
  created_at: string
  id: string
  instructions: string
  memory_scope: ProjectMemoryScope
  name: string
  revoked_at: string | null
  root: string
  updated_at: string
}

export function createProjectRepository(database: DatabaseSync): ProjectRepository {
  const projectSelection = `
    SELECT
      projects.*,
      project_directory_bindings.root,
      project_directory_bindings.canonical_root,
      (
        SELECT COUNT(*)
        FROM conversations
        WHERE conversations.project_id = projects.id
          AND EXISTS (
            SELECT 1 FROM runs
            WHERE runs.conversation_id = conversations.id
              AND runs.status IN ('queued', 'running')
          )
      ) AS active_run_count
    FROM projects
    INNER JOIN project_directory_bindings
      ON project_directory_bindings.project_id = projects.id
  `
  const find = database.prepare(`${projectSelection} WHERE projects.id = ?`)
  const list = database.prepare(`${projectSelection} ORDER BY projects.name, projects.id`)
  const create = database.prepare(`
    INSERT INTO projects (
      id, name, memory_scope, instructions, revoked_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, NULL, ?, ?)
  `)
  const bindDirectory = database.prepare(`
    INSERT INTO project_directory_bindings (
      project_id, root, canonical_root, access_granted_at, resources_trusted_at
    ) VALUES (?, ?, ?, ?, ?)
  `)
  const upsertDirectory = database.prepare(`
    INSERT INTO project_directory_bindings (
      project_id, root, canonical_root, access_granted_at, resources_trusted_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (project_id) DO UPDATE SET
      root = excluded.root,
      canonical_root = excluded.canonical_root,
      access_granted_at = excluded.access_granted_at,
      resources_trusted_at = excluded.resources_trusted_at
  `)
  const updateProject = database.prepare(`
    UPDATE projects
    SET name = ?, memory_scope = ?, instructions = ?, updated_at = ?
    WHERE id = ? AND revoked_at IS NULL
  `)
  const deleteProject = database.prepare(`
    UPDATE projects SET revoked_at = ?, updated_at = ?
    WHERE id = ? AND revoked_at IS NULL
  `)
  const insertEvent = database.prepare(`
    INSERT INTO project_events (id, project_id, event_type, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)
  const findActiveRun = database.prepare(`
    SELECT 1
    FROM conversations
    INNER JOIN runs ON runs.conversation_id = conversations.id
    WHERE conversations.project_id = ? AND runs.status IN ('queued', 'running')
    LIMIT 1
  `)

  return {
    create(input) {
      return withTransaction(database, () => {
        create.run(
          input.id,
          input.name,
          input.memoryScope,
          input.instructions,
          input.authorizedAt,
          input.authorizedAt,
        )
        bindDirectory.run(
          input.id,
          input.directory.root,
          input.directory.canonicalRoot,
          input.authorizedAt,
          input.authorizedAt,
        )
        return requireProject(find.get(input.id), input.id)
      })
    },
    delete(id, deletedAt, event) {
      return withTransaction(database, () => {
        if (Number(deleteProject.run(deletedAt, deletedAt, id).changes) !== 1)
          throw new Error(`Lexora Buddy project was not deleted: ${id}`)
        persistProjectEvent(insertEvent, event)
        return requireProject(find.get(id), id)
      })
    },
    findById(id) {
      const row = find.get(id) as ProjectRow | undefined
      return row ? toProject(row) : null
    },
    hasActiveRuns(id) {
      return Boolean(findActiveRun.get(id))
    },
    list() {
      return (list.all() as unknown as ProjectRow[]).map(toProject)
    },
    update(input) {
      return withTransaction(database, () => {
        if (Number(updateProject.run(
          input.name,
          input.memoryScope,
          input.instructions,
          input.updatedAt,
          input.id,
        ).changes) !== 1) {
          throw new Error(`Lexora Buddy project was not updated: ${input.id}`)
        }
        upsertDirectory.run(
          input.id,
          input.directory.root,
          input.directory.canonicalRoot,
          input.updatedAt,
          input.updatedAt,
        )
        persistProjectEvent(insertEvent, input.event)
        return requireProject(find.get(input.id), input.id)
      })
    },
  }
}

function persistProjectEvent(
  statement: ReturnType<DatabaseSync['prepare']>,
  event: ProjectEventInput,
): void {
  statement.run(
    event.id,
    event.projectId,
    event.eventType,
    JSON.stringify(event.payload),
    event.createdAt,
  )
}

function requireProject(value: unknown, id: string): ProjectRecord {
  const row = value as ProjectRow | undefined
  if (!row)
    throw new Error(`Lexora Buddy project was not persisted: ${id}`)
  return toProject(row)
}

function toProject(row: ProjectRow): ProjectRecord {
  return {
    activeRunCount: row.active_run_count,
    canonicalRoot: row.canonical_root,
    createdAt: row.created_at,
    id: row.id,
    instructions: row.instructions,
    memoryScope: row.memory_scope,
    name: row.name,
    revokedAt: row.revoked_at,
    root: row.root,
    updatedAt: row.updated_at,
  }
}
