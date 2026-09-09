<script setup lang="ts">
import type { ApplicationLogRecord } from '@buddy-shared/diagnostics/applicationLog'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { applicationLogCategory, applicationLogKey } from '@buddy-shared/diagnostics/applicationLog'
import { NVirtualList } from 'naive-ui'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { applicationLogTitle, formatLogDuration, formatLogTime } from '../../model/applicationLogPresentation'

const props = defineProps<{ records: ApplicationLogRecord[], selected: ApplicationLogRecord | null, language: BuddyLocale }>()
const emit = defineEmits<{ select: [record: ApplicationLogRecord], pause: [] }>()
const { t } = useBuddyI18n(() => props.language)
const selectedKey = computed(() => props.selected ? applicationLogKey(props.selected) : null)
const rows = computed(() => props.records.map(record => ({
  record,
  key: applicationLogKey(record),
  level: t(`applicationLogs.level.${record.level}`),
  category: t(`applicationLogs.category.${applicationLogCategory(record)}`),
  title: applicationLogTitle(record, t),
  time: formatLogTime(record.timestamp, props.language),
  duration: formatLogDuration(record.durationMs),
})))

function onScroll(event: Event): void {
  if ((event.currentTarget as HTMLElement).scrollTop > 8)
    emit('pause')
}
</script>

<template>
  <div class="log-list">
    <div class="log-list__head" aria-hidden="true">
      <span>{{ t('applicationLogs.time') }}</span><span>{{ t('applicationLogs.level') }}</span><span>{{ t('applicationLogs.event') }}</span><span>{{ t('applicationLogs.duration') }}</span>
    </div>
    <div v-if="!rows.length" class="log-list__empty">
      <span class="log-list__empty-symbol" aria-hidden="true">≡</span>
      <strong>{{ t('applicationLogs.empty') }}</strong>
      <span>{{ t('applicationLogs.emptyHint') }}</span>
    </div>
    <NVirtualList v-else class="log-list__body" :items="rows" :item-size="64" :visible-items-props="{ 'role': 'list', 'aria-label': t('applicationLogs.records') }" @scroll="onScroll">
      <template #default="{ item: row, index }">
        <div role="listitem" :aria-setsize="rows.length" :aria-posinset="index + 1">
          <button class="log-row" :class="[{ 'is-selected': row.key === selectedKey }, `is-${row.record.level}`]" :aria-expanded="row.key === selectedKey" @click="emit('select', row.record)">
            <time class="log-row__time" :datetime="row.record.timestamp">{{ row.time }}</time>
            <span class="log-row__level"><i aria-hidden="true" />{{ row.level }}</span>
            <span class="log-row__event">
              <span class="log-row__headline"><strong>{{ row.title }}</strong><span>{{ row.category }}</span></span>
              <span class="log-row__code">{{ row.record.event }}<span v-if="row.record.component || row.record.method"> · {{ row.record.method || row.record.component }}</span></span>
            </span>
            <span class="log-row__duration">{{ row.duration }}</span>
          </button>
        </div>
      </template>
    </NVirtualList>
  </div>
</template>

<style scoped>
.log-list { display: flex; min-width: 0; min-height: 0; flex: 1; flex-direction: column; border: 1px solid var(--buddy-border-subtle); border-radius: 0.45rem; overflow: hidden; }
.log-list__head, .log-row { display: grid; grid-template-columns: 6.3rem 3.7rem minmax(0, 1fr) 4.2rem; align-items: center; gap: 0.65rem; padding: 0.65rem 0.8rem; }
.log-list__head { flex: none; border-bottom: 1px solid var(--buddy-border-subtle); background: var(--buddy-surface-muted); color: var(--buddy-text-muted); font-size: 0.65rem; }
.log-list__head > :last-child { text-align: right; }
.log-list__body { min-height: 0; flex: 1; }
.log-row { width: 100%; height: 64px; box-sizing: border-box; border: 0; border-bottom: 1px solid var(--buddy-border-subtle); background: transparent; color: var(--buddy-text-primary); text-align: left; cursor: pointer; }
.log-row:hover { background: var(--buddy-nav-hover); }
.log-row.is-selected { background: var(--buddy-accent-surface-subtle); box-shadow: inset 2px 0 var(--buddy-accent-solid); }
.log-row:focus-visible { outline: 2px solid var(--buddy-focus-ring); outline-offset: -2px; }
.log-row__time, .log-row__code, .log-row__duration { font-family: var(--buddy-font-mono); font-size: 0.65rem; font-variant-numeric: tabular-nums; }
.log-row__time, .log-row__duration { color: var(--buddy-text-secondary); }
.log-row__duration { text-align: right; white-space: nowrap; }
.log-row__level { display: inline-flex; align-items: center; gap: 0.35rem; color: var(--buddy-text-secondary); font-size: 0.65rem; }
.log-row__level i { width: 5px; height: 5px; flex: none; border-radius: 50%; background: var(--buddy-accent-solid); }
.is-debug .log-row__level i { background: var(--buddy-text-muted); }
.is-warn .log-row__level { color: var(--buddy-status-warning-text); }
.is-warn .log-row__level i { background: var(--buddy-status-warning-solid); }
.is-error .log-row__level { color: var(--buddy-status-danger-text); }
.is-error .log-row__level i { background: var(--buddy-status-danger-solid); }
.log-row__event { display: grid; min-width: 0; gap: 0.28rem; }
.log-row__headline { display: flex; min-width: 0; align-items: baseline; gap: 0.7rem; font-size: 0.72rem; }
.log-row__headline strong { min-width: 0; overflow: hidden; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }
.log-row__headline > span { flex: none; color: var(--buddy-text-muted); font-size: 0.61rem; }
.log-row__code { overflow: hidden; color: var(--buddy-text-muted); text-overflow: ellipsis; white-space: nowrap; }
.log-list__empty { display: grid; align-content: center; justify-items: center; min-height: 12rem; flex: 1; gap: 0.65rem; padding: 2rem; color: var(--buddy-text-muted); text-align: center; font-size: 0.72rem; }
.log-list__empty strong { color: var(--buddy-text-secondary); font-weight: 500; }
.log-list__empty-symbol { color: var(--buddy-accent-text); font-size: 2rem; font-weight: 200; }
@media (max-width: 1000px) {
  .log-list__head, .log-row { grid-template-columns: 5.9rem 3rem minmax(0, 1fr); gap: 0.4rem; padding-inline: 0.6rem; }
  .log-row__duration, .log-list__head > :last-child, .log-row__headline > span { display: none; }
}
</style>
