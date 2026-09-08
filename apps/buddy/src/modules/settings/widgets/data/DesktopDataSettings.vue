<script setup lang="ts">
import type { DataSettingsProps } from './typing'
import { NAlert, NButton, NTag } from 'naive-ui'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { createDesktopAgentUsage } from '@/modules/settings/model/desktopAgentUsage'
import DesktopRunLogSection from '@/modules/settings/widgets/data/DesktopRunLogSection.vue'

const props = defineProps<DataSettingsProps>()
const { t } = useBuddyI18n(() => props.language)
const usage = computed(() => createDesktopAgentUsage(props.usageSnapshot))

function formatNumber(value: number) {
  return new Intl.NumberFormat(props.language, {
    maximumFractionDigits: 1,
    notation: value >= 10_000 ? 'compact' : 'standard',
  }).format(value)
}
</script>

<template>
  <div class="desktop-data-settings">
    <NAlert v-if="runtimeRestartError || usageError" type="error" :show-icon="false">
      {{ runtimeRestartError ?? usageError }}
    </NAlert>

    <section class="desktop-data-settings__section">
      <div class="desktop-data-settings__heading">
        <h2>{{ t('desktop.settings.runtime') }}</h2>
        <p>{{ t('desktop.settings.runtimeDescription') }}</p>
      </div>
      <div class="desktop-data-settings__group">
        <div class="desktop-data-settings__row">
          <div><strong>{{ t('desktop.agent.statusTitle') }}</strong><small>{{ t('desktop.agent.statusDescription') }}</small></div>
          <NTag
            :bordered="false"
            :type="runtimeState.status === 'ready' ? 'success'
              : 'warning'"
          >
            {{ t(`runtime.status.${runtimeState.status}`) }}
          </NTag>
        </div>
        <div class="desktop-data-settings__row">
          <div><strong>{{ t('desktop.agent.currentModel') }}</strong></div>
          <span>{{ selectedModel?.displayName ?? t('desktop.agent.noModel') }}</span>
        </div>
      </div>
      <NAlert v-if="runtimeState.status === 'offline'" type="error" :show-icon="false">
        <p>{{ runtimeError ?? t('desktop.agent.runtimeUnknownFailure') }}</p>
        <p v-if="runtimeState.pid !== null">
          {{ t('desktop.agent.runtimeProcessStillRunning', { pid: runtimeState.pid }) }}
        </p>
        <NButton
          v-else
          secondary
          :disabled="!canRestartRuntime"
          @click="restartRuntime"
        >
          {{ t('desktop.agent.runtimeRestart') }}
        </NButton>
      </NAlert>
    </section>

    <section class="desktop-data-settings__section">
      <div class="desktop-data-settings__heading">
        <h2>{{ t('desktop.agent.usageTitle') }}</h2>
        <p>{{ t('desktop.agent.usageDescription') }}</p>
      </div>
      <div class="desktop-data-settings__group desktop-data-settings__metrics">
        <div><span>{{ t('usage.totalTokens') }}</span><strong>{{ formatNumber(usage.totals.totalTokens) }}</strong></div>
        <div><span>{{ t('desktop.agent.recentRuns') }}</span><strong>{{ usage.totals.recordCount }}</strong></div>
      </div>
    </section>

    <section class="desktop-data-settings__section">
      <div class="desktop-data-settings__heading">
        <h2>{{ t('desktop.settings.runLogs') }}</h2>
        <p>{{ t('desktop.settings.runLogsDescription') }}</p>
      </div>
      <DesktopRunLogSection :language="language" :list-recent-runs="listRecentRuns" :list-run-events="listRunEvents" />
    </section>
  </div>
</template>

<style scoped lang="scss">
.desktop-data-settings,
.desktop-data-settings__section {
  display: grid;
  gap: 0.8rem;
}

.desktop-data-settings {
  gap: 1.8rem;
}

.desktop-data-settings__heading h2,
.desktop-data-settings__heading p {
  margin: 0;
}

.desktop-data-settings__heading h2 {
  font-size: 0.92rem;
}

.desktop-data-settings__heading p {
  margin-top: 0.25rem;
  color: var(--buddy-text-secondary);
  font-size: 0.72rem;
}

.desktop-data-settings__group {
  overflow: hidden;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 0.65rem;
  background: var(--buddy-surface-base);
}

.desktop-data-settings__row {
  display: flex;
  min-height: 4rem;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--buddy-border-subtle);
  padding: 0.75rem 0.9rem;

  &:last-child {
    border-bottom: 0;
  }

  > div {
    display: grid;
    gap: 0.2rem;
  }

  strong {
    font-size: 0.78rem;
  }

  small,
  span {
    color: var(--buddy-text-secondary);
    font-size: 0.68rem;
  }
}

.desktop-data-settings__metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));

  > div {
    display: grid;
    gap: 0.25rem;
    border-right: 1px solid var(--buddy-border-subtle);
    padding: 0.9rem;

    &:last-child {
      border-right: 0;
    }
  }

  span {
    color: var(--buddy-text-secondary);
    font-size: 0.68rem;
  }

  strong {
    font-size: 1.1rem;
  }
}
</style>
