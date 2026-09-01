import type {
  Automation,
  AutomationExecutionSnapshot,
} from '../../../shared/automation'
import type { SpaceExecutionContext } from '../../../shared/space'
import {
  automationExecutionSnapshotSchema,
  automationScheduleSchema,
  automationSchema,
} from '../../../shared/automation'

export interface AutomationRow {
  active_from: string | null
  active_until: string | null
  blocked_reason: Automation['blockedReason'] | 'AUTOMATION_PROJECT_UNAVAILABLE'
  created_at: string
  deleted_at: string | null
  execution_profile: Automation['executionProfile']
  id: string
  last_run_at: string | null
  model_id: string | null
  model_mode: Automation['model']['mode']
  name: string
  next_run_at: string | null
  space_id: string | null
  prompt: string
  provider_id: string | null
  reasoning: Extract<Automation['model'], { mode: 'pinned' }>['reasoning'] | null
  revision: number
  schedule_json: string
  schedule_kind: Automation['timing']['schedule']['kind']
  status: Automation['status']
  timezone: string
  updated_at: string
}

export function createAutomationExecutionSnapshot(
  row: AutomationRow,
  spaceContext: SpaceExecutionContext | null,
): AutomationExecutionSnapshot {
  const automation = toAutomationRecord(row)
  return automationExecutionSnapshotSchema.parse({
    executionProfile: automation.executionProfile,
    model: automation.model,
    name: automation.name,
    spaceId: automation.spaceId,
    spaceContext,
    prompt: automation.prompt,
    timing: automation.timing,
  })
}

export function requireAutomationRecord(value: unknown, id: string): Automation {
  const row = value as AutomationRow | undefined
  if (!row)
    throw new Error(`Lexora Buddy automation was not persisted: ${id}`)
  return toAutomationRecord(row)
}

export function toAutomationRecord(row: AutomationRow): Automation {
  return automationSchema.parse({
    blockedReason: fromStorageBlockedReason(row.blocked_reason),
    createdAt: row.created_at,
    executionProfile: row.execution_profile,
    id: row.id,
    lastRunAt: row.last_run_at,
    model: row.model_mode === 'default'
      ? { mode: 'default' }
      : {
          mode: 'pinned',
          modelId: row.model_id,
          providerId: row.provider_id,
          reasoning: row.reasoning,
        },
    name: row.name,
    nextRunAt: row.next_run_at,
    spaceId: row.space_id,
    prompt: row.prompt,
    revision: row.revision,
    status: row.status,
    timing: {
      activeFrom: row.active_from,
      activeUntil: row.active_until,
      schedule: automationScheduleSchema.parse(JSON.parse(row.schedule_json)),
      timezone: row.timezone,
    },
    updatedAt: row.updated_at,
  })
}

export function toStorageBlockedReason(
  reason: Automation['blockedReason'],
): AutomationRow['blocked_reason'] {
  return reason === 'AUTOMATION_SPACE_UNAVAILABLE'
    ? 'AUTOMATION_PROJECT_UNAVAILABLE'
    : reason
}

function fromStorageBlockedReason(
  reason: AutomationRow['blocked_reason'],
): Automation['blockedReason'] {
  return reason === 'AUTOMATION_PROJECT_UNAVAILABLE'
    ? 'AUTOMATION_SPACE_UNAVAILABLE'
    : reason
}
