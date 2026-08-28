import type {
  AutomationOccurrence,
  AutomationRunNowResult,
} from '../../../shared/automation'
import type { RuntimeRpcRegistrar } from '../rpc/runtimeRequest'
import type { ApprovalRepository } from '../storage/approvalRepository'
import type { AutomationOccurrenceRecord } from '../storage/automationOccurrenceRecord'
import type { RunRepository } from '../storage/runRepository'
import type { AutomationChangeCoordinator } from './AutomationChangeCoordinator'
import type { AutomationOccurrenceLifecycleService } from './AutomationOccurrenceLifecycleService'
import type { AutomationClock } from './AutomationScheduleEvaluator'
import type { AutomationService } from './AutomationService'
import { z } from 'zod'
import {
  automationMutationRequestSchemas,
  automationPreviewRequestSchema,
  automationRequestSchemas,
} from '../../../shared/automation'
import { parse } from '../rpc/runtimeRequest'
import { previewAutomationSchedule } from './AutomationScheduleEvaluator'
import { AutomationServiceError } from './AutomationService'

const schedulerWakeSchema = z.object({
  reason: z.enum(['resume', 'unlock-screen']),
}).strict()

export interface RegisterAutomationRpcOptions {
  approvals: Pick<ApprovalRepository, 'listPending'>
  changes: AutomationChangeCoordinator
  clock: AutomationClock
  lifecycle: Pick<AutomationOccurrenceLifecycleService, 'deleteOccurrence'>
  rpc: RuntimeRpcRegistrar
  runs: Pick<RunRepository, 'findById'>
  service: AutomationService
}

export function registerAutomationRpc(options: RegisterAutomationRpcOptions): () => void {
  const disposers: Array<() => void> = []
  const on = (method: string, handler: (params: unknown) => Promise<unknown> | unknown) => {
    disposers.push(options.rpc.onRequest(method, handler))
  }

  disposers.push(options.rpc.onNotification((method, params) => {
    if (method !== 'scheduler.wake')
      return
    if (schedulerWakeSchema.safeParse(params).success)
      options.changes.wakeScheduler()
  }))

  on('automations.preview', (params) => {
    const input = parse(automationPreviewRequestSchema, params)
    return previewAutomationSchedule(input, options.clock)
  })
  on('automations.list', (params) => {
    const page = options.service.list(parse(automationRequestSchemas.list, params))
    return {
      ...page,
      items: page.items.map((automation) => {
        const occurrence = options.service.getActiveOccurrence(automation.id)
        return {
          ...automation,
          activeOccurrence: occurrence
            ? toAutomationOccurrenceView(options, occurrence)
            : null,
        }
      }),
    }
  })
  on('automations.get', (params) => {
    const input = parse(automationRequestSchemas.get, params)
    const automation = options.service.get(input.automationId)
    if (!automation)
      throw new AutomationServiceError('AUTOMATION_NOT_FOUND')
    return automation
  })
  on('automations.create', (params) => {
    const automation = options.service.create(
      parse(automationMutationRequestSchemas.create, params),
    )
    options.changes.publish(automation.id)
    return automation
  })
  on('automations.update', (params) => {
    const automation = options.service.update(
      parse(automationMutationRequestSchemas.update, params),
    )
    options.changes.publish(automation.id)
    return automation
  })
  on('automations.pause', (params) => {
    const automation = options.service.pause(
      parse(automationMutationRequestSchemas.pause, params),
    )
    options.changes.publish(automation.id)
    return automation
  })
  on('automations.resume', (params) => {
    const automation = options.service.resume(
      parse(automationMutationRequestSchemas.resume, params),
    )
    options.changes.publish(automation.id)
    return automation
  })
  on('automations.delete', (params) => {
    const automation = options.service.delete(
      parse(automationMutationRequestSchemas.delete, params),
    )
    options.changes.publish(automation.id)
    return automation
  })
  on('automations.runNow', (params) => {
    const result = options.service.runNow(
      parse(automationMutationRequestSchemas.runNow, params),
    )
    if (result.outcome === 'started')
      options.changes.publish(result.occurrence.automationId)
    return toAutomationRunNowResult(result)
  })
  on('automations.listOccurrences', (params) => {
    const page = options.service.listHistory(
      parse(automationRequestSchemas.listOccurrences, params),
    )
    return {
      ...page,
      items: page.items.map(occurrence => toAutomationOccurrenceView(options, occurrence)),
    }
  })
  on('automations.deleteOccurrence', async (params) => {
    const input = parse(automationRequestSchemas.deleteOccurrence, params)
    return (await options.lifecycle.deleteOccurrence(input.occurrenceId)).deleted
  })

  return () => disposers.splice(0).forEach(dispose => dispose())
}

function toAutomationRunNowResult(result: AutomationRunNowResult): AutomationRunNowResult {
  return {
    occurrence: toPublicOccurrence(result.occurrence),
    outcome: result.outcome,
  }
}

function toAutomationOccurrenceView(
  options: Pick<RegisterAutomationRpcOptions, 'approvals' | 'runs'>,
  occurrence: AutomationOccurrenceRecord,
) {
  const run = occurrence.runId ? options.runs.findById(occurrence.runId) : null
  const pendingApprovalCount = run
    ? options.approvals.listPending(run.id).length
    : 0
  const effectiveStatus = run
    ? pendingApprovalCount > 0 && ['queued', 'running'].includes(run.status)
      ? 'awaiting_approval' as const
      : run.status
    : occurrence.status === 'bound' ? 'queued' : occurrence.status
  return {
    ...toPublicOccurrence(occurrence),
    automationName: occurrence.executionSnapshot.name,
    effectiveStatus,
    pendingApprovalCount,
    run: run
      ? {
          completedAt: run.completedAt,
          errorCode: run.errorCode,
          startedAt: run.startedAt,
          status: run.status,
        }
      : null,
  }
}

function toPublicOccurrence(
  occurrence: AutomationOccurrence | AutomationOccurrenceRecord,
): AutomationOccurrence {
  return {
    automationId: occurrence.automationId,
    automationRevision: occurrence.automationRevision,
    boundAt: occurrence.boundAt,
    coalescedMissedCount: occurrence.coalescedMissedCount,
    conversationId: occurrence.conversationId,
    errorCode: occurrence.errorCode,
    errorSummary: occurrence.errorSummary,
    finishedAt: occurrence.finishedAt,
    id: occurrence.id,
    queuedAt: occurrence.queuedAt,
    runId: occurrence.runId,
    scheduledFor: occurrence.scheduledFor,
    status: occurrence.status,
    triggerKind: occurrence.triggerKind,
  }
}
