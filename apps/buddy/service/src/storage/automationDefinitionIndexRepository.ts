import type { DatabaseSync } from 'node:sqlite'
import type { Automation } from '../../../shared/automation'
import type { AutomationCursor, AutomationPageRecord } from './automationPage'
import type { AutomationRow } from './automationRecord'
import {
  requireAutomationRecord,
  toAutomationRecord,
} from './automationRecord'

export interface AutomationDefinitionIndexRepository {
  findById: (id: string) => Automation | null
  list: (input: {
    before?: AutomationCursor | null
    limit: number
    statuses?: Automation['status'][]
  }) => AutomationPageRecord<Automation>
  listDue: (now: string, limit: number) => Automation[]
}

export interface AutomationDefinitionIndexStore {
  findAnyRow: (id: string) => AutomationRow | null
  repository: AutomationDefinitionIndexRepository
  requireById: (id: string) => Automation
}

export function createAutomationDefinitionIndexStore(
  database: DatabaseSync,
): AutomationDefinitionIndexStore {
  const findAny = database.prepare('SELECT * FROM automations WHERE id = ?')
  const listDue = database.prepare(`
    SELECT * FROM automations
    WHERE deleted_at IS NULL AND status = 'active' AND next_run_at <= ?
    ORDER BY next_run_at, id
    LIMIT ?
  `)

  return {
    findAnyRow(id) {
      const row = findAny.get(id) as AutomationRow | undefined
      return row ?? null
    },
    repository: {
      findById(id) {
        const row = findAny.get(id) as AutomationRow | undefined
        return row && !row.deleted_at ? toAutomationRecord(row) : null
      },
      list(input) {
        const clauses = ['deleted_at IS NULL']
        const parameters: Array<string | number> = []
        if (input.statuses && input.statuses.length > 0) {
          clauses.push(`status IN (${input.statuses.map(() => '?').join(', ')})`)
          parameters.push(...input.statuses)
        }
        if (input.before) {
          clauses.push('(updated_at < ? OR (updated_at = ? AND id < ?))')
          parameters.push(input.before.occurredAt, input.before.occurredAt, input.before.id)
        }
        const rows = database.prepare(`
          SELECT * FROM automations
          WHERE ${clauses.join(' AND ')}
          ORDER BY updated_at DESC, id DESC
          LIMIT ?
        `).all(...parameters, input.limit + 1) as unknown as AutomationRow[]
        const selected = rows.slice(0, input.limit)
        const last = selected.at(-1)
        return {
          items: selected.map(toAutomationRecord),
          nextCursor: rows.length > input.limit && last
            ? { id: last.id, occurredAt: last.updated_at }
            : null,
        }
      },
      listDue(now, limit) {
        return (listDue.all(now, limit) as unknown as AutomationRow[])
          .map(toAutomationRecord)
      },
    },
    requireById(id) {
      return requireAutomationRecord(findAny.get(id), id)
    },
  }
}
