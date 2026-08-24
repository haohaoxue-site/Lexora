import type { ConversationLifecycleService } from '../conversations/ConversationLifecycleService'
import type { AttentionNotificationService } from '../notifications/AttentionNotificationService'
import type { AutomationService } from './AutomationService'

export interface AutomationOccurrenceDeletionResult {
  automationId: string | null
  deleted: boolean
}

export interface AutomationOccurrenceLifecycleServiceOptions {
  automations: AutomationService
  conversationLifecycle: Pick<ConversationLifecycleService, 'delete'>
  notifications: Pick<AttentionNotificationService, 'removeAutomationRun'>
}

export class AutomationOccurrenceLifecycleService {
  readonly #automations: AutomationService
  readonly #conversationLifecycle: AutomationOccurrenceLifecycleServiceOptions['conversationLifecycle']
  readonly #notifications: AutomationOccurrenceLifecycleServiceOptions['notifications']

  constructor(options: AutomationOccurrenceLifecycleServiceOptions) {
    this.#automations = options.automations
    this.#conversationLifecycle = options.conversationLifecycle
    this.#notifications = options.notifications
  }

  async deleteConversation(conversationId: string): Promise<AutomationOccurrenceDeletionResult> {
    const occurrence = this.#automations.getOccurrenceByConversationId(conversationId)
    const occurrenceDeleted = occurrence
      ? this.#deleteOccurrenceRecord(occurrence.id, occurrence.runId)
      : false
    const conversationDeleted = await this.#conversationLifecycle.delete(conversationId)
    return {
      automationId: occurrence?.automationId ?? null,
      deleted: occurrenceDeleted || conversationDeleted,
    }
  }

  async deleteOccurrence(occurrenceId: string): Promise<AutomationOccurrenceDeletionResult> {
    const occurrence = this.#automations.getOccurrence(occurrenceId)
    if (!occurrence)
      return { automationId: null, deleted: false }
    const occurrenceDeleted = this.#deleteOccurrenceRecord(occurrence.id, occurrence.runId)
    const conversationDeleted = occurrence.conversationId
      ? await this.#conversationLifecycle.delete(occurrence.conversationId)
      : false
    return {
      automationId: occurrence.automationId,
      deleted: occurrenceDeleted || conversationDeleted,
    }
  }

  #deleteOccurrenceRecord(occurrenceId: string, runId: string | null): boolean {
    const deleted = this.#automations.markOccurrenceDeleted(occurrenceId)
    if (runId)
      this.#notifications.removeAutomationRun(runId)
    return deleted
  }
}
