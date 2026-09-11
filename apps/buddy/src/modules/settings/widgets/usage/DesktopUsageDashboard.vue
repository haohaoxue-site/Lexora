<script setup lang="ts">
import type { LocalProvider, LocalRuntimeModelOption } from '@buddy-shared/providers/providerApi'
import type { UsageAnalyticsState } from '../../state/useUsageAnalytics'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { summarizeRunTokenUsage } from '@buddy-shared/usage/runTokenUsage'
import { NAlert, NButton, NTooltip } from 'naive-ui'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { formatUsageNumber } from '../../model/usageAnalytics'
import DesktopUsageHeatmap from './DesktopUsageHeatmap.vue'
import DesktopUsageModels from './DesktopUsageModels.vue'
import DesktopUsageTasks from './DesktopUsageTasks.vue'
import DesktopUsageTrend from './DesktopUsageTrend.vue'

const props = defineProps<{
  analytics: UsageAnalyticsState
  language: BuddyLocale
  providers: readonly LocalProvider[]
  catalog: readonly LocalRuntimeModelOption[]
}>()
const emit = defineEmits<{ openTask: [id: string] }>()
const { t } = useBuddyI18n(() => props.language)
const metrics = computed(() => [
  { key: 'tokens', label: t('usageAnalytics.totalTokens'), value: props.analytics.overview.value.totals.totalTokens },
  { key: 'calls', label: t('usageAnalytics.calls'), value: props.analytics.overview.value.totals.recordCount },
  { key: 'days', label: t('usageAnalytics.activeDays'), value: props.analytics.overview.value.activeDays },
])
const tokenBuckets = computed(() => {
  const { totals } = props.analytics.overview.value
  return [
    ['usageAnalytics.uncachedInput', totals.inputTokens],
    ['usageAnalytics.output', totals.outputTokens],
    ['usageAnalytics.cacheRead', totals.cacheReadTokens],
    ['usageAnalytics.cacheWrite', totals.cacheWriteTokens],
  ] as const
})
const cacheRate = computed(() => summarizeRunTokenUsage(props.analytics.overview.value.totals).cacheHitRate)
const cacheLabel = computed(() => cacheRate.value === null ? '—' : new Intl.NumberFormat(props.language, { style: 'percent', maximumFractionDigits: 1 }).format(cacheRate.value))
</script>

<template>
  <div class="usage-dashboard">
    <NAlert v-if="analytics.error.value" type="error" :show-icon="false">
      {{ analytics.error.value }}
      <NButton size="small" @click="analytics.refresh">
        {{ t('desktop.loading.retry') }}
      </NButton>
    </NAlert>
    <template v-else>
      <div class="usage-dashboard__overview">
        <dl class="usage-summary">
          <div v-for="metric in metrics" :key="metric.key" class="usage-summary__metric" :data-metric="metric.key">
            <dt>{{ metric.label }}</dt>
            <dd>
              <NTooltip v-if="analytics.overview.value.totals.recordCount">
                <template #trigger>
                  <strong>{{ formatUsageNumber(metric.value, language) }}</strong>
                </template>
                {{ new Intl.NumberFormat(language).format(metric.value) }}
                <div v-if="metric.key === 'tokens'" class="usage-summary__breakdown">
                  <div v-for="[key, value] in tokenBuckets" :key="key" class="usage-summary__bucket">
                    <span>{{ t(key) }}</span><span>{{ new Intl.NumberFormat(language).format(value) }}</span>
                  </div>
                  <p>{{ t('usageAnalytics.compositionNote') }}</p>
                </div>
              </NTooltip>
              <strong v-else>—</strong>
            </dd>
          </div>
          <div class="usage-summary__metric" data-metric="cache">
            <dt>
              <NTooltip>
                <template #trigger>
                  <span>{{ t('usageAnalytics.cacheRate') }}</span>
                </template>
                {{ t('usageAnalytics.cacheRateNote') }}
              </NTooltip>
            </dt>
            <dd><strong>{{ cacheLabel }}</strong></dd>
          </div>
        </dl>
      </div>
      <DesktopUsageHeatmap
        :start-date="analytics.range.value.startDate" :end-date="analytics.range.value.endDate"
        :days="analytics.overview.value.days" :total-tokens="analytics.overview.value.totals.totalTokens"
        :record-count="analytics.overview.value.totals.recordCount" :language="language"
        :period="analytics.period.value" :years="analytics.years.value" :loading="analytics.loading.value"
        @update:period="analytics.setPeriod"
      />
      <div v-if="!analytics.overview.value.totals.recordCount" class="usage-dashboard__empty">
        <strong>{{ t('usageAnalytics.empty') }}</strong><p>{{ t('usageAnalytics.emptyDescription') }}</p>
      </div>
      <template v-else>
        <div class="usage-dashboard__annual">
          <DesktopUsageTasks :tasks="analytics.tasks.value" :loading="analytics.tasksLoading.value" :error="analytics.tasksError.value" :language="language" @open-task="emit('openTask', $event)" @retry="analytics.refresh" />
          <DesktopUsageModels :models="analytics.overview.value.models" :providers="providers" :catalog="catalog" :language="language" />
        </div>
        <DesktopUsageTrend :trend="analytics.trend" :language="language" />
      </template>
    </template>
    <footer class="usage-dashboard__footnote">
      {{ t('usageAnalytics.deletedNote') }}
    </footer>
  </div>
</template>

<style scoped>
.usage-dashboard { display: grid; min-width: 0; gap: 24px; container: usage / inline-size; }
.usage-dashboard__overview { display: flex; align-items: center; gap: 28px; }
.usage-summary { display: grid; min-width: 0; flex: 1; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; margin: 0; padding: 2px 0 4px; }
.usage-summary__metric { min-width: 0; }
.usage-summary dt { margin-bottom: 8px; color: var(--buddy-text-secondary); font-size: 12px; }
.usage-summary dd { margin: 0; }
.usage-summary strong { color: var(--buddy-text-strong); font-size: clamp(21px, 2.8cqi, 30px); font-variant-numeric: tabular-nums; font-weight: 550; line-height: 1.2; letter-spacing: -0.6px; }
.usage-summary__metric:first-child strong { color: var(--buddy-accent-text); }
.usage-summary__breakdown { display: grid; max-width: 290px; gap: 8px; margin-top: 12px; font-size: 12px; font-variant-numeric: tabular-nums; }
.usage-summary__bucket { display: flex; justify-content: space-between; gap: 24px; }
.usage-summary__bucket > span:first-child { color: var(--buddy-text-secondary); }
.usage-summary__breakdown p { margin: 4px 0 0; color: var(--buddy-text-secondary); font-size: 11px; line-height: 1.6; }
.usage-dashboard__annual { display: grid; min-width: 0; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; }
.usage-dashboard__empty { padding: 20px 0; text-align: center; }
.usage-dashboard__empty strong { color: var(--buddy-text-primary); font-size: 14px; font-weight: 500; }
.usage-dashboard__empty p { color: var(--buddy-text-secondary); font-size: 12px; line-height: 1.6; }
.usage-dashboard__footnote { border-top: 1px solid var(--buddy-border-subtle); padding-top: 16px; color: var(--buddy-text-secondary); font-size: 11px; line-height: 1.7; }
@container usage (max-width: 760px) {
  .usage-dashboard__overview { flex-wrap: wrap; gap: 20px; }
  .usage-summary { flex-basis: 100%; gap: 14px; }
  .usage-dashboard__annual { grid-template-columns: minmax(0, 1fr); }
}
</style>
