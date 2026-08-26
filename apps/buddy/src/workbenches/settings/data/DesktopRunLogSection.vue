<script setup lang="ts">
import type { LocalRun, LocalRunEvent } from '@buddy-electron/shared/localChatApi'
import type { DesktopDataSettingsCapability } from '@/workbenches/settings/data/desktopDataSettingsCapability'
import { NEmpty, NSpin, NTag } from 'naive-ui'
import { computed, onMounted, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  dataSettings: DesktopDataSettingsCapability
}>()

const dataSettings = props.dataSettings
const { t } = useBuddyI18n(dataSettings.language)
const runs = shallowRef<ReadonlyArray<LocalRun>>([])
const events = shallowRef<ReadonlyArray<LocalRunEvent>>([])
const selectedRunId = shallowRef<string | null>(null)
const isLoading = shallowRef(false)
const isUnavailable = shallowRef(false)
const selectedRun = computed(() => runs.value.find(run => run.id === selectedRunId.value) ?? null)

onMounted(loadRuns)

watch(selectedRunId, async (runId) => {
  try {
    events.value = runId ? await dataSettings.listRunEvents(runId) : []
  }
  catch {
    events.value = []
    isUnavailable.value = true
  }
})

async function loadRuns() {
  isLoading.value = true
  isUnavailable.value = false
  try {
    runs.value = await dataSettings.listRecentRuns()
    if (!runs.value.some(run => run.id === selectedRunId.value))
      selectedRunId.value = runs.value[0]?.id ?? null
  }
  catch {
    runs.value = []
    events.value = []
    selectedRunId.value = null
    isUnavailable.value = true
  }
  finally {
    isLoading.value = false
  }
}

function formatDate(value: string | null) {
  if (!value)
    return '-'

  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(dataSettings.language.value, { dateStyle: 'short', timeStyle: 'medium' }).format(date)
}

function statusType(status: LocalRun['status']) {
  if (status === 'completed')
    return 'success'
  if (status === 'failed')
    return 'error'
  if (status === 'running' || status === 'queued')
    return 'warning'

  return 'default'
}

function summarizePayload(payload: unknown) {
  const text = JSON.stringify(payload)
  return text.length > 300 ? `${text.slice(0, 300)}…` : text
}
</script>

<template>
  <section class="desktop-run-log-section">
    <div class="desktop-run-log-section__body">
      <aside>
        <NSpin v-if="isLoading && !runs.length" size="small" />
        <NEmpty
          v-else-if="!runs.length"
          :description="isUnavailable ? t('desktop.logs.unavailable') : t('log.empty')"
        />
        <button
          v-for="run in runs"
          v-else
          :key="run.id"
          :class="{ 'is-active': run.id === selectedRunId }"
          type="button"
          @click="selectedRunId = run.id"
        >
          <span>
            <strong>{{ run.purpose }}</strong>
            <small>{{ formatDate(run.startedAt) }}</small>
          </span>
          <NTag :bordered="false" size="small" :type="statusType(run.status)">
            {{ t(`run.status.${run.status}`) }}
          </NTag>
        </button>
      </aside>

      <div class="desktop-run-log-section__detail">
        <NEmpty v-if="!selectedRun" :description="t('log.detailEmpty')" />
        <template v-else>
          <div class="desktop-run-log-section__meta">
            <div><span>{{ t('desktop.logs.provider') }}</span><code>{{ selectedRun.providerId }}</code></div>
            <div><span>{{ t('desktop.logs.model') }}</span><code>{{ selectedRun.modelId }}</code></div>
          </div>
          <NEmpty v-if="!events.length" :description="t('control.noRecords')" />
          <ol v-else>
            <li v-for="event in events" :key="`${event.runId}:${event.sequence}`">
              <div>
                <strong>{{ event.type }}</strong>
                <time>{{ formatDate(event.createdAt) }}</time>
              </div>
              <code>{{ summarizePayload(event.payload) }}</code>
            </li>
          </ol>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.desktop-run-log-section {
  display: grid;
  gap: 1rem;
}

.desktop-run-log-section__body {
  display: grid;
  min-height: 22rem;
  grid-template-columns: minmax(14rem, 18rem) minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 0.85rem;
  background: var(--buddy-surface-raised);

  > aside {
    display: grid;
    align-content: start;
    gap: 0.25rem;
    max-height: 28rem;
    overflow-y: auto;
    border-right: 1px solid var(--buddy-border-subtle);
    padding: 0.35rem;

    > button {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 0.5rem;
      border: 0;
      border-radius: 0.55rem;
      background: transparent;
      color: var(--buddy-text-primary);
      cursor: pointer;
      padding: 0.65rem;
      text-align: left;

      &:hover,
      &.is-active {
        background: var(--buddy-state-hover);
      }

      > span {
        display: grid;
        min-width: 0;
      }

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        font-size: 0.75rem;
      }

      small {
        color: var(--buddy-text-secondary);
        font-size: 0.66rem;
      }
    }
  }
}

.desktop-run-log-section__detail {
  min-width: 0;
  max-height: 28rem;
  overflow-y: auto;
  padding: 0.8rem;

  ol {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    gap: 0.35rem;
    border: 1px solid var(--buddy-border-subtle);
    border-radius: 0.55rem;
    background: var(--buddy-surface-subtle);
    padding: 0.6rem;

    > div {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      font-size: 0.7rem;
    }

    time {
      color: var(--buddy-text-muted);
    }

    code {
      overflow-wrap: anywhere;
      color: var(--buddy-text-secondary);
      font-family: var(--buddy-font-mono);
      font-size: 0.66rem;
      line-height: 1.55;
    }
  }
}

.desktop-run-log-section__meta {
  display: grid;
  gap: 0.35rem;
  margin-bottom: 0.8rem;

  > div {
    display: grid;
    grid-template-columns: 5rem minmax(0, 1fr);
    gap: 0.5rem;
    font-size: 0.68rem;
  }

  span {
    color: var(--buddy-text-secondary);
  }

  code {
    overflow: hidden;
    color: var(--buddy-text-primary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@media (max-width: 840px) {
  .desktop-run-log-section__body {
    grid-template-columns: minmax(0, 1fr);

    > aside {
      max-height: 14rem;
      border-right: 0;
      border-bottom: 1px solid var(--buddy-border-subtle);
    }
  }
}
</style>
