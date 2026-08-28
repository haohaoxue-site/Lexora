import type { UsageRecord } from '../storage/usageRepository'

export function toPublicUsage(record: UsageRecord) {
  const { model, provider, sourceEntryId: _sourceEntryId, ...rest } = record
  return { ...rest, modelId: model, providerId: provider }
}
