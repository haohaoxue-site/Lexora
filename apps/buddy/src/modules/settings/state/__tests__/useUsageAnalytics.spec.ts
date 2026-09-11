import type { LocalUsageAnalytics, LocalUsageTopTasks, UsageTopTasksRequest } from '@buddy-shared/usage/usageAnalyticsApi'
import { afterEach, describe, expect, it } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
import { emptyUsageCounts } from '../../model/usageAnalytics'
import { useUsageAnalytics } from '../useUsageAnalytics'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, resolve, reject }
}

const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()))
async function settle() {
  await new Promise(resolve => setImmediate(resolve))
  await nextTick()
}
function snapshot(date: string, tokens: number): LocalUsageAnalytics {
  return {
    days: [{ ...emptyUsageCounts(), date, providerId: 'service', modelId: 'model', totalTokens: tokens, inputTokens: tokens, recordCount: 1 }],
    firstRecordedAt: `${date}T00:00:00.000Z`,
  }
}

function fixture() {
  const scope = effectScope()
  scopes.push(scope)
  const reports: ReturnType<typeof deferred<LocalUsageAnalytics>>[] = []
  const tasks: Array<ReturnType<typeof deferred<LocalUsageTopTasks>> & { input: UsageTopTasksRequest }> = []
  const runtime = shallowRef({ status: 'ready' })
  const owner = scope.run(() => useUsageAnalytics({
    api: {
      trend: async () => [],
      analytics: () => {
        const request = deferred<LocalUsageAnalytics>()
        reports.push(request)
        return request.promise
      },
      topTasks: (input) => {
        const request = { ...deferred<LocalUsageTopTasks>(), input }
        tasks.push(request)
        return request.promise
      },
    },
    language: shallowRef('zh-CN' as const),
    runtime,
    ready: Promise.resolve(),
  }))!
  return { scope, owner, runtime, reports, tasks }
}

const currentTask = { conversationId: 'current', title: 'Current', spaceName: null, recordCount: 1, totalTokens: 300 }

describe('usage query lifecycle', () => {
  it('rejects late period results and keeps annual totals and tasks independent of the trend window', async () => {
    const f = fixture()
    await settle()
    f.owner.setPeriod(2024)
    await settle()
    f.reports[1]!.resolve(snapshot('2024-02-29', 300))
    f.tasks[1]!.resolve([currentTask])
    await settle()
    f.reports[0]!.resolve(snapshot('2026-01-01', 900))
    f.tasks[0]!.resolve([{ ...currentTask, conversationId: 'stale', totalTokens: 900 }])
    await settle()
    expect(f.owner.overview.value.totals.totalTokens).toBe(300)
    expect(f.owner.tasks.value).toEqual([currentTask])
    expect(f.tasks[1]!.input).toMatchObject({ startDate: '2024-01-01', endDate: '2024-12-31', model: null })
    f.owner.trend.setView('day')
    f.owner.trend.setDate('2024-02-29')
    await settle()
    expect(f.owner.trend.request.value).toMatchObject({ startDate: '2024-02-29', endDate: '2024-02-29', granularity: 'hour' })
    expect(f.owner.overview.value.totals.totalTokens).toBe(300)
    expect(f.owner.tasks.value).toEqual([currentTask])
    expect(f.owner.tasksLoading.value).toBe(false)
  })

  it('loads every model without carrying a hidden model filter across refreshes', async () => {
    const f = fixture()
    await settle()
    const first = snapshot('2024-02-29', 300)
    f.reports[0]!.resolve({ ...first, days: [...first.days, { ...first.days[0]!, providerId: 'another-service', inputTokens: 200, totalTokens: 200 }] })
    f.tasks[0]!.resolve([currentTask])
    await settle()
    expect(f.owner.overview.value.models).toHaveLength(2)
    expect(f.owner.overview.value.totals.totalTokens).toBe(500)
    f.owner.refresh()
    await settle()
    expect(f.tasks[1]!.input.model).toBeNull()
    f.reports[1]!.resolve({ days: [], firstRecordedAt: first.firstRecordedAt })
    f.tasks[1]!.resolve([])
    await settle()
    expect(f.owner.overview.value.totals.recordCount).toBe(0)
    expect(f.owner.tasks.value).toEqual([])
  })

  it('invalidates requests on runtime restart and on disposal', async () => {
    const f = fixture()
    await settle()
    f.runtime.value = { status: 'offline' }
    await settle()
    f.reports[0]!.resolve(snapshot('2024-01-01', 100))
    f.tasks[0]!.resolve([])
    await settle()
    expect(f.owner.snapshot.value).toBeNull()
    f.runtime.value = { status: 'ready' }
    await settle()
    f.reports[1]!.resolve(snapshot('2024-01-02', 200))
    f.tasks[1]!.resolve([])
    await settle()
    expect(f.owner.overview.value.totals.totalTokens).toBe(200)
    f.owner.refresh()
    await settle()
    f.scope.stop()
    f.reports[2]!.resolve(snapshot('2024-01-03', 500))
    f.tasks[2]!.reject(new Error('disposed'))
    await settle()
    expect(f.owner.overview.value.totals.totalTokens).toBe(200)
    expect(f.owner.tasksError.value).toBeNull()
  })
})
