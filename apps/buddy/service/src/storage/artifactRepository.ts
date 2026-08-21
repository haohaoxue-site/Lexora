import type { DatabaseSync } from 'node:sqlite'

export type ArtifactOperation = 'created' | 'deleted' | 'edited'

export interface ArtifactRecord {
  canonicalPath: string
  createdAt: string
  id: string
  mimeType: string | null
  operation: ArtifactOperation
  projectId: string | null
  runId: string
}

export interface ArtifactRepository {
  listForRun: (runId: string) => ArtifactRecord[]
}

interface ArtifactRow {
  canonical_path: string
  created_at: string
  id: string
  mime_type: string | null
  operation: ArtifactOperation
  project_id: string | null
  run_id: string
}

export function createArtifactRepository(database: DatabaseSync): ArtifactRepository {
  const list = database.prepare(`
    SELECT * FROM artifacts WHERE run_id = ? ORDER BY created_at, id
  `)

  return {
    listForRun(runId) {
      return (list.all(runId) as unknown as ArtifactRow[]).map(toArtifact)
    },
  }
}

function toArtifact(row: ArtifactRow): ArtifactRecord {
  return {
    canonicalPath: row.canonical_path,
    createdAt: row.created_at,
    id: row.id,
    mimeType: row.mime_type,
    operation: row.operation,
    projectId: row.project_id,
    runId: row.run_id,
  }
}
