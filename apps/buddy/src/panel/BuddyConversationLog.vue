<script setup lang="ts">
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { BuddyRun, BuddyRunEventSummary } from '@/lib/tauriRuntime'
import type { BuddyConversationLogRunRow } from '@/panel/runEventView'
import { NTag, NVirtualList } from 'naive-ui'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { createRunEventSummaryViewRows, resolveRunStatusLabel } from '@/panel/runEventView'

const props = defineProps<{
  activeRunId: string | null
  eventSummaries: ReadonlyArray<BuddyRunEventSummary>
  isLoadingEvents: boolean
  language: BuddyLocale
  rows: ReadonlyArray<BuddyConversationLogRunRow>
}>()

const emit = defineEmits<{
  selectRun: [runId: string]
}>()

const { t } = useBuddyI18n(() => props.language)

const activeRun = computed(() =>
  props.activeRunId
    ? props.rows.find(row => row.id === props.activeRunId) ?? null
    : null,
)

const activeEventRows = computed(() =>
  createRunEventSummaryViewRows(props.eventSummaries, t).slice().reverse(),
)
const virtualRunRows = computed(() => [...props.rows])
const virtualEventRows = computed(() => [...activeEventRows.value])

function selectRun(runId: string) {
  emit('selectRun', runId)
}

function isActiveRun(runId: string) {
  return props.activeRunId === runId
}

function resolveStatusType(status: BuddyRun['status']) {
  if (status === 'completed')
    return 'success'

  if (status === 'failed')
    return 'error'

  if (status === 'cancelled')
    return 'default'

  return 'warning'
}

function formatDateTime(value: string | null) {
  if (!value)
    return t('common.missing')

  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return value

  return new Intl.DateTimeFormat(props.language, {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
  }).format(date)
}
</script>

<template>
  <section class="buddy-conversation-log">
    <div
      v-if="rows.length > 0"
      class="buddy-conversation-log__layout"
    >
      <aside class="buddy-conversation-log__runs">
        <header class="buddy-conversation-log__panel-head">
          <strong>{{ t('log.conversationRunList') }}</strong>
          <small>{{ t('control.logCount', { count: rows.length }) }}</small>
        </header>

        <NVirtualList
          class="buddy-conversation-log__virtual-list"
          :items="virtualRunRows"
          :item-size="92"
          key-field="key"
        >
          <template #default="{ item }">
            <button
              class="buddy-conversation-log__run"
              :class="{ 'is-active': isActiveRun(item.id) }"
              type="button"
              @click="selectRun(item.id)"
            >
              <span class="buddy-conversation-log__run-head">
                <strong>{{ item.title }}</strong>
                <NTag
                  round
                  size="small"
                  :type="resolveStatusType(item.status)"
                >
                  {{ resolveRunStatusLabel(item.status, t) }}
                </NTag>
              </span>
              <span class="buddy-conversation-log__run-meta">
                {{ t('log.startedAt') }} {{ formatDateTime(item.startedAt) }}
              </span>
              <span class="buddy-conversation-log__run-foot">
                <span>{{ item.subtitle }}</span>
                <span>{{ t('log.eventCount', { count: item.eventCount }) }}</span>
              </span>
            </button>
          </template>
        </NVirtualList>
      </aside>

      <article class="buddy-conversation-log__details">
        <header
          v-if="activeRun"
          class="buddy-conversation-log__panel-head"
        >
          <div>
            <strong>{{ t('log.eventDetails') }}</strong>
            <small>
              {{ t('log.startedAt') }} {{ formatDateTime(activeRun.startedAt) }}
              /
              {{ t('log.completedAt') }} {{ formatDateTime(activeRun.completedAt) }}
            </small>
          </div>
          <NTag
            round
            size="small"
            :type="resolveStatusType(activeRun.status)"
          >
            {{ resolveRunStatusLabel(activeRun.status, t) }}
          </NTag>
        </header>

        <NVirtualList
          v-if="activeEventRows.length > 0"
          class="buddy-conversation-log__virtual-list"
          :items="virtualEventRows"
          :item-size="104"
          key-field="key"
        >
          <template #default="{ item }">
            <section class="buddy-conversation-log__event">
              <span>{{ item.title }}</span>
              <p>{{ item.summary || t('common.missing') }}</p>
            </section>
          </template>
        </NVirtualList>

        <p
          v-else-if="isLoadingEvents"
          class="buddy-conversation-log__empty"
        >
          {{ t('log.loadingEvents') }}
        </p>

        <p
          v-else
          class="buddy-conversation-log__empty"
        >
          {{ activeRun ? t('control.noRecords') : t('log.detailEmpty') }}
        </p>
      </article>
    </div>

    <p
      v-else
      class="buddy-conversation-log__empty"
    >
      {{ t('log.empty') }}
    </p>
  </section>
</template>

<style scoped lang="scss">
.buddy-conversation-log {
  display: grid;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.buddy-conversation-log__layout {
  display: grid;
  grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
  gap: 14px;
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.buddy-conversation-log__runs,
.buddy-conversation-log__details {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--buddy-border-light);
  border-radius: 8px;
  background: var(--buddy-bg-surface);
}

.buddy-conversation-log__panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  min-width: 0;
  border-bottom: 1px solid var(--buddy-border-light);
  padding: 14px 16px;
}

.buddy-conversation-log__panel-head div {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.buddy-conversation-log__panel-head strong {
  color: var(--buddy-text-primary);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.25;
}

.buddy-conversation-log__panel-head small {
  color: var(--buddy-text-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.buddy-conversation-log__virtual-list {
  height: 100%;
  min-height: 0;
}

.buddy-conversation-log__run {
  display: grid;
  gap: 7px;
  width: calc(100% - 16px);
  height: 80px;
  margin: 6px 8px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--buddy-text-primary);
  cursor: pointer;
  padding: 10px 11px;
  text-align: left;
}

.buddy-conversation-log__run:hover,
.buddy-conversation-log__run.is-active {
  border-color: color-mix(in srgb, var(--buddy-accent-primary) 42%, var(--buddy-border-light));
  background: color-mix(in srgb, var(--buddy-accent-primary) 8%, var(--buddy-bg-surface));
}

.buddy-conversation-log__run-head,
.buddy-conversation-log__run-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.buddy-conversation-log__run-head strong,
.buddy-conversation-log__run-foot span:first-child {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-conversation-log__run-head strong {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.25;
}

.buddy-conversation-log__run-meta,
.buddy-conversation-log__run-foot {
  color: var(--buddy-text-secondary);
  font-size: 12px;
  line-height: 1.3;
}

.buddy-conversation-log__event {
  display: grid;
  gap: 7px;
  height: 92px;
  margin: 6px 16px;
  border-bottom: 1px solid var(--buddy-border-light);
  padding: 10px 0 12px;
}

.buddy-conversation-log__event span {
  color: var(--buddy-text-primary);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.25;
}

.buddy-conversation-log__event p,
.buddy-conversation-log__empty {
  margin: 0;
  color: var(--buddy-text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.buddy-conversation-log__event p {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.buddy-conversation-log__empty {
  display: grid;
  place-items: center;
  min-height: 100%;
  border: 1px solid var(--buddy-border-light);
  border-radius: 8px;
  background: var(--buddy-bg-surface);
  padding: 20px;
  text-align: center;
}

@media (max-width: 980px) {
  .buddy-conversation-log__layout {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(180px, 34%) minmax(0, 1fr);
  }
}
</style>
