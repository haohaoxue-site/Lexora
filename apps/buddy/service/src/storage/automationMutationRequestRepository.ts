import type { DatabaseSync } from 'node:sqlite'

export const AUTOMATION_MUTATION_OPERATIONS = [
  'create',
  'update',
  'pause',
  'resume',
  'delete',
  'run_now',
] as const

export type AutomationMutationOperation = typeof AUTOMATION_MUTATION_OPERATIONS[number]

export interface AutomationMutationRequestRecord {
  automationId: string
  createdAt: string
  operation: AutomationMutationOperation
  requestFingerprint: string
  requestId: string
  response: unknown
}

interface AutomationMutationRequestRow {
  automation_id: string
  created_at: string
  operation: AutomationMutationOperation
  request_fingerprint: string
  request_id: string
  response_json: string
}

export interface AutomationMutationRequestRepository {
  create: (record: AutomationMutationRequestRecord) => void
  find: (requestId: string) => AutomationMutationRequestRecord | null
}

export function createAutomationMutationRequestRepository(
  database: DatabaseSync,
): AutomationMutationRequestRepository {
  const find = database.prepare(`
    SELECT * FROM automation_mutation_requests WHERE request_id = ?
  `)
  const create = database.prepare(`
    INSERT INTO automation_mutation_requests (
      request_id, operation, request_fingerprint, automation_id, response_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `)

  return {
    create(record) {
      create.run(
        record.requestId,
        record.operation,
        record.requestFingerprint,
        record.automationId,
        JSON.stringify(record.response),
        record.createdAt,
      )
    },
    find(requestId) {
      const row = find.get(requestId) as AutomationMutationRequestRow | undefined
      return row ? toRecord(row) : null
    },
  }
}

function toRecord(row: AutomationMutationRequestRow): AutomationMutationRequestRecord {
  return {
    automationId: row.automation_id,
    createdAt: row.created_at,
    operation: row.operation,
    requestFingerprint: row.request_fingerprint,
    requestId: row.request_id,
    response: JSON.parse(row.response_json),
  }
}
