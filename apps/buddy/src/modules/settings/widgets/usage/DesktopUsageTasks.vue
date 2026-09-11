<script setup lang="ts">
import type { LocalUsageTopTasks } from '@buddy-shared/usage/usageAnalyticsApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { ArrowUpRight20Regular } from '@vicons/fluent'
import { NTooltip } from 'naive-ui'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import DesktopPaneBoundary from '@/shared/ui/loading/DesktopPaneBoundary.vue'
import { formatUsageNumber } from '../../model/usageAnalytics'

const props = defineProps<{
  tasks: LocalUsageTopTasks | null
  loading: boolean
  error: string | null
  language: BuddyLocale
}>()
const emit = defineEmits<{ openTask: [id: string], retry: [] }>()
const { t } = useBuddyI18n(() => props.language)
const numberFormat = computed(() => new Intl.NumberFormat(props.language))
const rows = computed(() => {
  const peak = props.tasks?.[0]?.totalTokens ?? 0
  return (props.tasks ?? []).map(task => ({ ...task, width: peak ? task.totalTokens / peak * 100 : 0 }))
})
</script>

<template>
  <section class="usage-tasks">
    <header class="usage-tasks__heading">
      <h3>{{ t('usageAnalytics.topTasks') }}</h3>
      <span>Top 5</span>
    </header>
    <DesktopPaneBoundary :loading="loading" :error="error" :label="t('desktop.loading.pane')" :retry-label="t('desktop.loading.retry')" @retry="emit('retry')">
      <ol v-if="rows.length" class="usage-tasks__list">
        <li v-for="(task, index) in rows" :key="task.conversationId" class="usage-tasks__row">
          <span class="usage-tasks__rank">{{ String(index + 1).padStart(2, '0') }}</span>
          <div class="usage-tasks__task">
            <div class="usage-tasks__line">
              <NTooltip>
                <template #trigger>
                  <button type="button" class="usage-tasks__name" @click="emit('openTask', task.conversationId)">
                    <span>{{ task.title || t('usageAnalytics.untitledTask') }}</span>
                    <DesktopIcon :component="ArrowUpRight20Regular" :size="13" />
                  </button>
                </template>
                {{ task.title || t('usageAnalytics.untitledTask') }}
              </NTooltip>
              <NTooltip>
                <template #trigger>
                  <strong class="usage-tasks__amount">{{ formatUsageNumber(task.totalTokens, language) }}</strong>
                </template>
                {{ numberFormat.format(task.totalTokens) }} tokens
              </NTooltip>
            </div>
            <div class="usage-tasks__bar" aria-hidden="true">
              <span :style="{ width: `${task.width}%` }" />
            </div>
            <span class="usage-tasks__meta">{{ task.spaceName ? `${task.spaceName} · ` : '' }}{{ t('usageAnalytics.modelCalls', { count: numberFormat.format(task.recordCount) }) }}</span>
          </div>
        </li>
      </ol>
      <p v-else class="usage-tasks__empty">
        {{ t('usageAnalytics.noTasks') }}
      </p>
    </DesktopPaneBoundary>
  </section>
</template>

<style scoped>
.usage-tasks { display: flex; min-width: 0; flex-direction: column; border: 1px solid var(--buddy-border-subtle); border-radius: 8px; padding: 18px; }
.usage-tasks__heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.usage-tasks__heading h3 { margin: 0; color: var(--buddy-text-strong); font-size: 14px; font-weight: 600; }
.usage-tasks__heading > span { border-radius: 4px; background: var(--buddy-accent-surface); padding: 2px 6px; color: var(--buddy-accent-on-surface); font-size: 10px; font-weight: 550; }
.usage-tasks :deep(.desktop-pane-boundary) { min-height: 160px; flex: 1; }
.usage-tasks__list { display: grid; gap: 16px; margin: 12px 0 0; padding: 0; list-style: none; }
.usage-tasks__row { display: flex; min-width: 0; align-items: flex-start; gap: 12px; }
.usage-tasks__rank { width: 16px; flex: none; padding-top: 2px; color: var(--buddy-text-secondary); font-size: 10px; font-variant-numeric: tabular-nums; }
.usage-tasks__row:first-child .usage-tasks__rank { color: var(--buddy-accent-text); }
.usage-tasks__task { display: grid; min-width: 0; flex: 1; gap: 6px; }
.usage-tasks__line { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 10px; }
.usage-tasks__name { display: flex; overflow: hidden; min-width: 0; align-items: center; gap: 4px; border: 0; border-radius: 3px; background: transparent; padding: 0; color: var(--buddy-text-primary); cursor: pointer; font: inherit; font-size: 12px; text-align: left; }
.usage-tasks__name > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.usage-tasks__name :deep(.n-icon) { flex: none; color: var(--buddy-text-disabled); }
.usage-tasks__name:hover { color: var(--buddy-accent-text); }
.usage-tasks__name:focus-visible { outline: 2px solid var(--buddy-focus-ring); outline-offset: 2px; }
.usage-tasks__bar { height: 3px; overflow: hidden; border-radius: 2px; background: var(--buddy-surface-subtle); }
.usage-tasks__bar > span { display: block; height: 100%; border-radius: inherit; background: var(--buddy-accent-solid); opacity: .7; }
.usage-tasks__row:first-child .usage-tasks__bar > span { opacity: 1; }
.usage-tasks__meta { overflow: hidden; color: var(--buddy-text-secondary); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.usage-tasks__amount { flex: none; color: var(--buddy-text-primary); font-size: 12px; font-weight: 550; font-variant-numeric: tabular-nums; }
.usage-tasks__empty { padding: 40px 0; color: var(--buddy-text-secondary); font-size: 12px; text-align: center; }
</style>
