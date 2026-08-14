import type {
  NotificationAttentionRecord,
  NotificationAttentionRepository,
} from '../storage/notificationAttentionRepository'
import type { ProviderModelStateRecord } from '../storage/providerRepository'

const MODEL_UPDATE_NOTIFICATION_ID = 'local:model-source-parameters-updated'
const RETENTION_MILLISECONDS = 7 * 24 * 60 * 60 * 1000

export interface AttentionNotification {
  action: { type: 'open-model-settings' }
  attention: 'seen' | 'unseen'
  audience: 'device'
  id: string
  kind: 'model.source-parameters-updated'
  lifecycle: 'active' | 'resolved'
  occurredAt: string
  origin: 'local-runtime'
  payload: { modelCount: number }
  resolvedAt: string | null
  revision: string
}

export interface AttentionNotificationList {
  items: AttentionNotification[]
  unseenCount: number
}

export interface AttentionNotificationServiceOptions {
  attention: NotificationAttentionRepository
  listModels: () => ProviderModelStateRecord[]
  now?: () => string
}

export class AttentionNotificationService {
  readonly #attention: NotificationAttentionRepository
  readonly #listModels: () => ProviderModelStateRecord[]
  readonly #now: () => string

  constructor(options: AttentionNotificationServiceOptions) {
    this.#attention = options.attention
    this.#listModels = options.listModels
    this.#now = options.now ?? (() => new Date().toISOString())
  }

  list(): AttentionNotificationList {
    this.#reconcile()
    const items = this.#attention.list()
      .filter(record => record.kind === 'model.source-parameters-updated')
      .map(toNotification)
      .sort(compareNotifications)
    return {
      items,
      unseenCount: items.filter(item => item.attention === 'unseen').length,
    }
  }

  markAllSeen(): AttentionNotificationList {
    const now = this.#now()
    this.#reconcile(now)
    this.#attention.markAllSeen(now)
    return this.list()
  }

  markSeen(notificationId: string, revision: string): AttentionNotificationList {
    const now = this.#now()
    this.#reconcile(now)
    this.#attention.markSeen(notificationId, revision, now)
    return this.list()
  }

  #reconcile(now = this.#now()): void {
    this.#reconcileModelUpdates(now)
    this.#attention.pruneResolvedLocalBefore(
      new Date(Date.parse(now) - RETENTION_MILLISECONDS).toISOString(),
    )
  }

  #reconcileModelUpdates(now: string): void {
    const pending = this.#listModels().filter(model => (
      model.overrideContextWindow !== null
      && model.overrideMaxTokens !== null
      && model.acknowledgedSourceRevision !== model.sourceRevision
    ))
    const current = this.#attention.findById(MODEL_UPDATE_NOTIFICATION_ID)
    if (pending.length === 0) {
      if (current?.resolvedAt === null)
        this.#attention.markResolved(MODEL_UPDATE_NOTIFICATION_ID, now)
      return
    }
    const latest = pending.reduce((value, model) => (
      model.sourceRevision > value.sourceRevision ? model : value
    ))
    const revision = current && current.revision > latest.sourceRevision
      ? current.revision
      : latest.sourceRevision
    this.#attention.observe({
      kind: 'model.source-parameters-updated',
      notificationId: MODEL_UPDATE_NOTIFICATION_ID,
      observedAt: now,
      occurredAt: Number.isNaN(Date.parse(latest.sourceRevision))
        ? latest.updatedAt
        : latest.sourceRevision,
      origin: 'local-runtime',
      payload: { modelCount: pending.length },
      resolvedAt: null,
      revision,
    })
  }
}

function compareNotifications(left: AttentionNotification, right: AttentionNotification): number {
  if (left.attention !== right.attention)
    return left.attention === 'unseen' ? -1 : 1
  if (left.lifecycle !== right.lifecycle)
    return left.lifecycle === 'active' ? -1 : 1
  return right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id)
}

function toNotification(record: NotificationAttentionRecord): AttentionNotification {
  return {
    action: { type: 'open-model-settings' },
    attention: record.seenRevision === record.revision ? 'seen' as const : 'unseen' as const,
    audience: 'device' as const,
    id: record.notificationId,
    kind: 'model.source-parameters-updated',
    lifecycle: record.resolvedAt === null ? 'active' as const : 'resolved' as const,
    occurredAt: record.occurredAt,
    origin: 'local-runtime' as const,
    payload: record.payload as { modelCount: number },
    resolvedAt: record.resolvedAt,
    revision: record.revision,
  }
}
