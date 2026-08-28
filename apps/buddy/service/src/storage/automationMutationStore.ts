import type { DatabaseSync } from 'node:sqlite'
import type { ZodType } from 'zod'
import type {
  Automation,
  AutomationRunNowResult,
} from '../../../shared/automation'
import type { AutomationMutationOperation } from './automationMutationRequestRepository'
import {
  automationRunNowResultSchema,
  automationSchema,
} from '../../../shared/automation'
import { createAutomationMutationRequestRepository } from './automationMutationRequestRepository'
import { AutomationRepositoryError } from './automationRepositoryError'

export interface AutomationMutationIdentity {
  createdAt: string
  fingerprint: string
  operation: AutomationMutationOperation
  requestId: string
}

export interface AutomationMutationReplayRepository {
  replayAutomationMutation: (
    mutation: AutomationMutationIdentity,
  ) => Automation | null
  replayRunNowMutation: (
    mutation: AutomationMutationIdentity,
  ) => AutomationRunNowResult | null
}

export interface AutomationMutationStore {
  repository: AutomationMutationReplayRepository
  save: (
    automationId: string,
    mutation: AutomationMutationIdentity,
    response: unknown,
  ) => void
}

export function createAutomationMutationStore(
  database: DatabaseSync,
): AutomationMutationStore {
  const requests = createAutomationMutationRequestRepository(database)

  const replay = <T>(
    mutation: AutomationMutationIdentity,
    schema: ZodType<T>,
  ): T | null => {
    const existing = requests.find(mutation.requestId)
    if (!existing)
      return null
    if (
      existing.operation !== mutation.operation
      || existing.requestFingerprint !== mutation.fingerprint
    ) {
      throw new AutomationRepositoryError('conflict')
    }
    return schema.parse(existing.response)
  }

  return {
    repository: {
      replayAutomationMutation(mutation) {
        return replay(mutation, automationSchema)
      },
      replayRunNowMutation(mutation) {
        return replay(mutation, automationRunNowResultSchema)
      },
    },
    save(automationId, mutation, response) {
      requests.create({
        automationId,
        createdAt: mutation.createdAt,
        operation: mutation.operation,
        requestFingerprint: mutation.fingerprint,
        requestId: mutation.requestId,
        response,
      })
    },
  }
}
