import type { LocalUsageSnapshot } from '@buddy-electron/shared/localChatApi'

type UsageRecord = LocalUsageSnapshot['records'][number]

export interface DesktopUsageTotals {
  cacheReadTokens: number
  cacheWriteTokens: number
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  recordCount: number
  totalCost: number
  totalTokens: number
}

export interface DesktopAgentUsage {
  byModel: ReadonlyMap<string, DesktopUsageTotals>
  byProvider: ReadonlyMap<string, DesktopUsageTotals>
  byPurpose: ReadonlyMap<string, DesktopUsageTotals>
  daily: ReadonlyMap<string, DesktopUsageTotals>
  latestAt: string | null
  totals: DesktopUsageTotals
}

export function createDesktopAgentUsage(snapshot: LocalUsageSnapshot | null): DesktopAgentUsage {
  const usage: DesktopAgentUsage = {
    byModel: new Map(),
    byProvider: new Map(),
    byPurpose: new Map(),
    daily: new Map(),
    latestAt: null,
    totals: snapshot ? { ...snapshot.totals } : emptyTotals(),
  }
  for (const record of snapshot?.records ?? []) {
    addToGroup(usage.byProvider as Map<string, DesktopUsageTotals>, record.providerId, record)
    addToGroup(
      usage.byModel as Map<string, DesktopUsageTotals>,
      `${record.providerId}:${record.modelId}`,
      record,
    )
    addToGroup(usage.byPurpose as Map<string, DesktopUsageTotals>, record.purpose, record)
    addToGroup(usage.daily as Map<string, DesktopUsageTotals>, record.createdAt.slice(0, 10), record)
    if (!usage.latestAt || record.createdAt > usage.latestAt)
      usage.latestAt = record.createdAt
  }
  return usage
}

function addToGroup(
  group: Map<string, DesktopUsageTotals>,
  key: string,
  record: UsageRecord,
) {
  const totals = group.get(key) ?? emptyTotals()
  addRecord(totals, record)
  group.set(key, totals)
}

function addRecord(totals: DesktopUsageTotals, record: UsageRecord) {
  totals.cacheReadTokens += record.cacheReadTokens
  totals.cacheWriteTokens += record.cacheWriteTokens
  totals.inputTokens += record.inputTokens
  totals.outputTokens += record.outputTokens
  totals.reasoningTokens += record.reasoningTokens ?? 0
  totals.recordCount += 1
  totals.totalCost += record.totalCost
  totals.totalTokens += record.totalTokens
}

function emptyTotals(): DesktopUsageTotals {
  return {
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    recordCount: 0,
    totalCost: 0,
    totalTokens: 0,
  }
}
