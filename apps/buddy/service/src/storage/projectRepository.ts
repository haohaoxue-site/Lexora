import type { DatabaseSync } from 'node:sqlite'
import { withTransaction } from './database'

export type ProjectMemoryScope = 'personal_and_project' | 'project_only'

export interface ProjectRecord {
  activeRunCount: number
  id: string
  root: string
  canonicalRoot: string
  directoryRoot: string | null
  directoryCanonicalRoot: string | null
  managedRoot: string | null
  memoryScope: ProjectMemoryScope
  instructions: string
  name: string
  revokedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateProjectRecordInput {
  authorizedAt: string
  directory: {
    canonicalRoot: string
    root: string
  } | null
  id: string
  instructions: string
  managedRoot: string
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
  } | null
  event: ProjectEventInput
  id: string
  instructions: string
  memoryScope: ProjectMemoryScope
  name: string
  updatedAt: string
}

export interface ProjectRepository {
  completeDeletion: (id: string, completedAt: string) => boolean
  create: (input: CreateProjectRecordInput) => ProjectRecord
  delete: (id: string, deletedAt: string, event: ProjectEventInput) => ProjectRecord
  findById: (id: string) => ProjectRecord | null
  hasActiveRuns: (id: string) => boolean
  list: () => ProjectRecord[]
  update: (input: UpdateProjectRecordInput) => ProjectRecord
}

interface ProjectRow {
  active_run_count: number
  id: string
  root: string
  canonical_root: string
  directory_canonical_root: string | null
  directory_root: string | null
  directory_access_granted_at: string | null
  directory_resources_trusted_at: string | null
  managed_root: string | null
  memory_scope: ProjectMemoryScope
  instructions: string
  name: string
  access_granted_at: string
  resources_trusted_at: string | null
  revoked_at: string | null
  created_at: string
  updated_at: string
}

export function createProjectRepository(database: DatabaseSync): ProjectRepository {
  const projectSelection = `
    SELECT
      projects.*,
      project_directory_bindings.root AS directory_root,
      project_directory_bindings.canonical_root AS directory_canonical_root,
      project_directory_bindings.access_granted_at AS directory_access_granted_at,
      project_directory_bindings.resources_trusted_at AS directory_resources_trusted_at,
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
    LEFT JOIN project_directory_bindings
      ON project_directory_bindings.project_id = projects.id
  `
  const find = database.prepare(`${projectSelection} WHERE projects.id = ?`)
  const list = database.prepare(`${projectSelection} ORDER BY projects.name, projects.id`)
  const create = database.prepare(`
    INSERT INTO projects (
      id, root, canonical_root, managed_root, memory_scope, instructions,
      name, access_granted_at, resources_trusted_at, revoked_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
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
  const removeDirectory = database.prepare(`
    DELETE FROM project_directory_bindings WHERE project_id = ?
  `)
  const updateProject = database.prepare(`
    UPDATE projects
    SET name = ?, memory_scope = ?, instructions = ?, updated_at = ?
    WHERE id = ? AND revoked_at IS NULL
  `)
  const deleteProject = database.prepare(`
    UPDATE projects
    SET memory_scope = 'personal_and_project', instructions = '',
        revoked_at = ?, updated_at = ?
    WHERE id = ? AND revoked_at IS NULL
  `)
  const completeDeletion = database.prepare(`
    UPDATE projects
    SET managed_root = NULL, updated_at = ?
    WHERE id = ? AND revoked_at IS NOT NULL AND managed_root IS NOT NULL
  `)
  const insertEvent = database.prepare(`
    INSERT INTO project_events (id, project_id, event_type, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)
  const findActiveRun = database.prepare(`
    SELECT 1
    FROM conversations
    JOIN runs ON runs.conversation_id = conversations.id
    WHERE conversations.project_id = ? AND runs.status IN ('queued', 'running')
    LIMIT 1
  `)

  return {
    completeDeletion(id, completedAt) {
      return Number(completeDeletion.run(completedAt, id).changes) === 1
    },
    create(input) {
      return withTransaction(database, () => {
        create.run(
          input.id,
          input.managedRoot,
          input.managedRoot,
          input.managedRoot,
          input.memoryScope,
          input.instructions,
          input.name,
          input.authorizedAt,
          input.authorizedAt,
          input.authorizedAt,
          input.authorizedAt,
        )
        if (input.directory) {
          bindDirectory.run(
            input.id,
            input.directory.root,
            input.directory.canonicalRoot,
            input.authorizedAt,
            input.authorizedAt,
          )
        }
        return requireProject(find.get(input.id), input.id)
      })
    },
    delete(id, deletedAt, event) {
      return withTransaction(database, () => {
        if (Number(deleteProject.run(deletedAt, deletedAt, id).changes) !== 1)
          throw new Error(`Lexora Buddy project was not deleted: ${id}`)
        removeDirectory.run(id)
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
        if (input.directory) {
          upsertDirectory.run(
            input.id,
            input.directory.root,
            input.directory.canonicalRoot,
            input.updatedAt,
            input.updatedAt,
          )
        }
        else {
          removeDirectory.run(input.id)
        }
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
  const directoryRoot = row.directory_root
  const directoryCanonicalRoot = row.directory_canonical_root
  return {
    activeRunCount: row.active_run_count,
    id: row.id,
    root: directoryRoot ?? row.root,
    canonicalRoot: directoryCanonicalRoot ?? row.canonical_root,
    directoryRoot,
    directoryCanonicalRoot,
    managedRoot: row.managed_root,
    memoryScope: row.memory_scope,
    instructions: row.instructions,
    name: row.name,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
