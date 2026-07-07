<script setup lang="ts">
import type { Component } from 'vue'
import type { BuddyLocale, BuddyTranslate } from '@/i18n/buddyI18n'
import type {
  BuddyRuntime,
  BuddyUsageRecord,
  BuddyUsageSnapshot,
  BuddyUsageTotals,
} from '@/lib/tauriRuntime'
import {
  ArrowDownload20Regular,
  ArrowSyncCircle20Regular,
  ArrowUpload20Regular,
  DataUsage20Regular,
} from '@vicons/fluent'
import { NCalendar, NEmpty, NIcon, NRadioButton, NRadioGroup, NTooltip } from 'naive-ui'
import { computed, shallowRef } from 'vue'

type BuddyUsageFilter = BuddyRuntime | 'all'

interface UsageMetricCard {
  label: string
  exactValue: string
  value: string
}

interface DailyUsageAggregate extends BuddyUsageTotals {
  date: string
}

type DailyUsageMetricKey = 'total' | 'input' | 'output' | 'cache'

interface DailyUsageMetric {
  key: DailyUsageMetricKey
  label: string
  exactValue: string
  value: string
  icon: Component
}

interface DailyUsageTooltipGroup {
  runtime: BuddyRuntime
  label: string
  metrics: DailyUsageMetric[]
}

const props = defineProps<{
  language: BuddyLocale
  t: BuddyTranslate
  usageSnapshot: BuddyUsageSnapshot
}>()

const usageFilter = shallowRef<BuddyUsageFilter>('all')
const calendarValue = shallowRef(Date.now())
const missingValueLabel = '-'
const runtimeOrder: readonly BuddyRuntime[] = ['codex', 'claude']

const usageFilterOptions = computed(() => [
  {
    label: props.t('usage.filterAll'),
    value: 'all',
  },
  {
    label: 'Codex',
    value: 'codex',
  },
  {
    label: 'Claude',
    value: 'claude',
  },
])

const filteredUsageRecords = computed(() => {
  if (usageFilter.value === 'all')
    return props.usageSnapshot.records

  return props.usageSnapshot.records.filter(record => record.runtime === usageFilter.value)
})

const filteredUsageTotals = computed(() => summarizeUsageRecords(filteredUsageRecords.value))

const usageSummaryCards = computed<UsageMetricCard[]>(() => {
  const totals = filteredUsageTotals.value
  return [
    createUsageMetricCard(props.t('usage.totalTokens'), totals.totalTokens),
    createUsageMetricCard(props.t('usage.inputTokens'), totals.inputTokens),
    createUsageMetricCard(props.t('usage.outputTokens'), totals.outputTokens),
    createUsageMetricCard(
      props.t('usage.cacheTokens'),
      totals.cacheCreationTokens + totals.cacheReadTokens,
    ),
  ]
})

const dailyUsageMap = computed(() => {
  const aggregates = new Map<string, DailyUsageAggregate>()
  for (const record of filteredUsageRecords.value) {
    if (!record.date)
      continue

    const aggregate = aggregates.get(record.date) ?? createDailyUsageAggregate(record.date)
    addRecordToTotals(aggregate, record)
    aggregates.set(record.date, aggregate)
  }

  return aggregates
})

function createUsageMetricCard(label: string, value: number): UsageMetricCard {
  return {
    exactValue: formatExactTokenCount(value),
    label,
    value: formatCompactTokenCount(value),
  }
}

function createDailyUsageAggregate(date: string): DailyUsageAggregate {
  return {
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    date,
    inputTokens: 0,
    outputTokens: 0,
    recordCount: 0,
    totalTokens: 0,
  }
}

function summarizeUsageRecords(records: ReadonlyArray<BuddyUsageRecord>): BuddyUsageTotals {
  return records.reduce<BuddyUsageTotals>((totals, record) => {
    addRecordToTotals(totals, record)

    return totals
  }, {
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    recordCount: 0,
    totalTokens: 0,
  })
}

function addRecordToTotals(totals: BuddyUsageTotals, record: BuddyUsageRecord) {
  totals.inputTokens += record.inputTokens
  totals.outputTokens += record.outputTokens
  totals.cacheCreationTokens += record.cacheCreationTokens
  totals.cacheReadTokens += record.cacheReadTokens
  totals.totalTokens += record.totalTokens
  totals.recordCount += 1
}

function resolveCalendarDateKey(year: number, month: number, date: number) {
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(date).padStart(2, '0'),
  ].join('-')
}

function resolveCalendarDayUsage(year: number, month: number, date: number) {
  return dailyUsageMap.value.get(resolveCalendarDateKey(year, month, date)) ?? null
}

function resolveCalendarDayMetrics(year: number, month: number, date: number) {
  const usage = resolveCalendarDayUsage(year, month, date)
  if (!usage)
    return []

  return createDailyUsageMetrics(usage)
}

function createDailyUsageMetrics(usage: DailyUsageAggregate): DailyUsageMetric[] {
  return [
    {
      exactValue: formatExactTokenCount(usage.totalTokens),
      icon: DataUsage20Regular,
      key: 'total',
      label: resolveDailyMetricLabel('total'),
      value: formatCompactTokenCount(usage.totalTokens),
    },
    {
      exactValue: formatExactTokenCount(usage.inputTokens),
      icon: ArrowUpload20Regular,
      key: 'input',
      label: resolveDailyMetricLabel('input'),
      value: formatCompactTokenCount(usage.inputTokens),
    },
    {
      exactValue: formatExactTokenCount(usage.outputTokens),
      icon: ArrowDownload20Regular,
      key: 'output',
      label: resolveDailyMetricLabel('output'),
      value: formatCompactTokenCount(usage.outputTokens),
    },
    {
      exactValue: formatExactTokenCount(usage.cacheCreationTokens + usage.cacheReadTokens),
      icon: ArrowSyncCircle20Regular,
      key: 'cache',
      label: resolveDailyMetricLabel('cache'),
      value: formatCompactTokenCount(usage.cacheCreationTokens + usage.cacheReadTokens),
    },
  ]
}

function resolveCalendarDayTooltipGroups(year: number, month: number, date: number) {
  const dateKey = resolveCalendarDateKey(year, month, date)
  const aggregates = new Map<BuddyRuntime, DailyUsageAggregate>()

  for (const record of filteredUsageRecords.value) {
    if (record.date !== dateKey)
      continue

    const aggregate = aggregates.get(record.runtime) ?? createDailyUsageAggregate(dateKey)
    addRecordToTotals(aggregate, record)
    aggregates.set(record.runtime, aggregate)
  }

  return runtimeOrder.reduce<DailyUsageTooltipGroup[]>((groups, runtime) => {
    const aggregate = aggregates.get(runtime)
    if (!aggregate)
      return groups

    groups.push({
      runtime,
      label: resolveRuntimeLabel(runtime),
      metrics: createDailyUsageMetrics(aggregate),
    })

    return groups
  }, [])
}

function resolveRuntimeLabel(runtime: BuddyRuntime) {
  return runtime === 'codex' ? 'Codex' : 'Claude'
}

function resolveDailyMetricLabel(key: DailyUsageMetricKey) {
  if (props.language !== 'zh-CN') {
    const labels: Record<DailyUsageMetricKey, string> = {
      cache: 'Cache',
      input: 'Input',
      output: 'Output',
      total: 'Total',
    }

    return labels[key]
  }

  const labels: Record<DailyUsageMetricKey, string> = {
    cache: '缓存',
    input: '输入',
    output: '输出',
    total: '总量',
  }

  return labels[key]
}

function formatExactTokenCount(value: number | null | undefined) {
  if (value === null || value === undefined)
    return missingValueLabel

  return `${new Intl.NumberFormat(props.language).format(Math.max(0, Math.round(value)))} tokens`
}

function formatCompactTokenCount(value: number | null | undefined) {
  if (value === null || value === undefined)
    return missingValueLabel

  const count = Math.max(0, Math.round(value))
  if (count < 1000)
    return new Intl.NumberFormat(props.language).format(count)

  const units = ['', 'K', 'M', 'B', 'T'] as const
  const exponent = Math.min(Math.floor(Math.log(count) / Math.log(1000)), units.length - 1)
  const scaled = count / 1000 ** exponent
  const formatted = new Intl.NumberFormat(props.language, {
    maximumFractionDigits: scaled >= 10 ? 0 : 1,
  }).format(scaled)

  return `${formatted}${units[exponent]}`
}
</script>

<template>
  <section class="buddy-usage-panel">
    <div class="buddy-usage-panel__summary">
      <header class="buddy-usage-panel__head">
        <div>
          <strong>{{ props.t('usage.tokensTitle') }}</strong>
        </div>
        <NRadioGroup
          v-model:value="usageFilter"
          size="small"
        >
          <NRadioButton
            v-for="option in usageFilterOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </NRadioButton>
        </NRadioGroup>
      </header>

      <dl class="buddy-usage-panel__metrics">
        <NTooltip
          v-for="card in usageSummaryCards"
          :key="card.label"
        >
          <template #trigger>
            <div>
              <dt>{{ card.label }}</dt>
              <dd>{{ card.value }}</dd>
            </div>
          </template>
          {{ card.exactValue }}
        </NTooltip>
      </dl>
    </div>

    <section class="buddy-usage-panel__calendar">
      <NEmpty
        v-if="filteredUsageRecords.length === 0"
        size="small"
        :description="props.t('usage.noTokenRecords')"
      />

      <template v-else>
        <NCalendar
          v-model:value="calendarValue"
          class="buddy-usage-panel__calendar-grid"
        >
          <template #default="{ year, month, date }">
            <NTooltip
              v-if="resolveCalendarDayUsage(year, month, date)"
              placement="top"
            >
              <template #trigger>
                <div class="buddy-usage-panel__calendar-cell is-active">
                  <ul class="buddy-usage-panel__calendar-metrics">
                    <li
                      v-for="metric in resolveCalendarDayMetrics(year, month, date)"
                      :key="metric.key"
                    >
                      <NIcon
                        :aria-label="metric.label"
                        :component="metric.icon"
                        :size="13"
                      />
                      <strong>{{ metric.value }}</strong>
                    </li>
                  </ul>
                </div>
              </template>
              <div class="buddy-usage-panel__calendar-tooltip">
                <section
                  v-for="group in resolveCalendarDayTooltipGroups(year, month, date)"
                  :key="group.runtime"
                >
                  <strong>{{ group.label }}</strong>
                  <span
                    v-for="metric in group.metrics"
                    :key="metric.key"
                  >
                    {{ metric.label }}：{{ metric.exactValue }}
                  </span>
                </section>
              </div>
            </NTooltip>
          </template>
        </NCalendar>
      </template>
    </section>
  </section>
</template>

<style scoped lang="scss">
.buddy-usage-panel {
  display: grid;
  gap: 18px;
}

.buddy-usage-panel__summary,
.buddy-usage-panel__calendar {
  border: 1px solid var(--buddy-border-light);
  border-radius: 8px;
  background: var(--buddy-bg-surface);
  box-shadow: 0 10px 26px rgb(23 33 28 / 6%);
}

.buddy-usage-panel__summary {
  display: grid;
  gap: 18px;
  padding: 20px;
}

.buddy-usage-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.buddy-usage-panel__head strong {
  color: var(--buddy-text-primary);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.2;
}

.buddy-usage-panel__head p {
  margin: 6px 0 0;
  color: var(--buddy-text-secondary);
  font-size: 13px;
  line-height: 1.45;
}

.buddy-usage-panel__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}

.buddy-usage-panel__metrics div {
  display: grid;
  gap: 7px;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--buddy-border-light) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--buddy-fill-light) 72%, #ffffff);
  padding: 13px 14px;
}

.buddy-usage-panel__metrics dt {
  margin: 0;
  color: var(--buddy-text-secondary);
  font-size: 12px;
  line-height: 1.35;
}

.buddy-usage-panel__metrics dd {
  min-width: 0;
  margin: 0;
  color: var(--buddy-text-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.buddy-usage-panel__metrics dd {
  font-size: 21px;
  line-height: 1.1;
}

.buddy-usage-panel__calendar {
  display: grid;
  gap: 14px;
  padding: 18px;
}

.buddy-usage-panel__calendar-grid {
  --n-border-color: var(--buddy-border-light);
  --n-title-font-size: 16px;
  --n-date-color-current: var(--buddy-accent-primary);
  --n-bar-color: transparent;
  --n-cell-color: transparent;
  --n-cell-color-hover: color-mix(in srgb, var(--buddy-accent-primary) 8%, #ffffff);
}

.buddy-usage-panel__calendar-grid :deep(.n-calendar-cell--selected) {
  background: color-mix(in srgb, var(--buddy-accent-primary) 13%, #ffffff);
}

.buddy-usage-panel__calendar-grid :deep(.n-calendar-cell--selected:hover) {
  background: color-mix(in srgb, var(--buddy-accent-primary) 16%, #ffffff);
}

.buddy-usage-panel__calendar-grid :deep(.n-calendar-cell__bar) {
  display: none;
}

.buddy-usage-panel__calendar-cell {
  position: absolute;
  inset: 38px 10px 10px;
  display: grid;
  place-items: center;
  gap: 6px;
  min-height: 0;
  color: var(--buddy-text-secondary);
  font-size: 12px;
  line-height: 1.25;
}

.buddy-usage-panel__calendar-cell.is-active {
  color: var(--buddy-text-primary);
}

.buddy-usage-panel__calendar-metrics {
  display: grid;
  gap: 6px;
  justify-items: start;
  margin: 0;
  padding: 0;
}

.buddy-usage-panel__calendar-metrics li {
  display: grid;
  grid-template-columns: 14px minmax(0, max-content);
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--buddy-accent-primary);
  list-style: none;
}

.buddy-usage-panel__calendar-metrics :deep(.n-icon) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: color-mix(in srgb, var(--buddy-accent-primary) 82%, var(--buddy-text-secondary));
  line-height: 1;
}

.buddy-usage-panel__calendar-metrics :deep(.n-icon svg) {
  display: block;
}

.buddy-usage-panel__calendar-metrics strong {
  min-width: 0;
  color: var(--buddy-accent-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.15;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-usage-panel__calendar-tooltip {
  display: grid;
  gap: 10px;
}

.buddy-usage-panel__calendar-tooltip section {
  display: grid;
  gap: 4px;
}

.buddy-usage-panel__calendar-tooltip strong {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.25;
}

.buddy-usage-panel__calendar-tooltip span {
  font-size: 13px;
  line-height: 1.35;
}

@media (max-width: 760px) {
  .buddy-usage-panel__head {
    display: grid;
  }

  .buddy-usage-panel__metrics {
    grid-template-columns: 1fr;
  }
}
</style>
