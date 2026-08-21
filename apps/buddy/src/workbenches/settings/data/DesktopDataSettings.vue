<script setup lang="ts">
import type { DesktopDataSettingsCapability } from '@/workbenches/settings/data/desktopDataSettingsCapability'
import { NAlert, NTag } from 'naive-ui'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { createDesktopAgentUsage } from '@/workbenches/settings/data/desktopAgentUsage'
import DesktopRunLogSection from '@/workbenches/settings/data/DesktopRunLogSection.vue'
import DesktopRuntimeRecovery from '@/workbenches/settings/data/DesktopRuntimeRecovery.vue'
import DesktopRuntimeRecoveryNotice from '@/workbenches/settings/data/DesktopRuntimeRecoveryNotice.vue'

const props = defineProps<{ dataSettings: DesktopDataSettingsCapability }>()
const dataSettings = props.dataSettings
const { t } = useBuddyI18n(dataSettings.language)
const usage = computed(() => createDesktopAgentUsage(dataSettings.usageSnapshot.value))

function formatNumber(value: number) {
  return new Intl.NumberFormat(dataSettings.language.value, {
    maximumFractionDigits: 1,
    notation: value >= 10_000 ? 'compact' : 'standard',
  }).format(value)
}
</script>

<template>
  <div class="desktop-data-settings">
    <NAlert v-if="dataSettings.runtimeRestartError.value || dataSettings.usageError.value" type="error" :show-icon="false">
      {{ dataSettings.runtimeRestartError.value ?? dataSettings.usageError.value }}
    </NAlert>

    <DesktopRuntimeRecoveryNotice
      v-if="dataSettings.runtimeDataRecoveryReceipt.value"
      :language="dataSettings.language.value"
      :receipt="dataSettings.runtimeDataRecoveryReceipt.value"
    />

    <section class="desktop-data-settings__section">
      <div class="desktop-data-settings__heading">
        <h2>{{ t('desktop.settings.runtimeAndRecovery') }}</h2>
        <p>{{ t('desktop.settings.runtimeAndRecoveryDescription') }}</p>
      </div>
      <div class="desktop-data-settings__group">
        <div class="desktop-data-settings__row">
          <div><strong>{{ t('desktop.agent.statusTitle') }}</strong><small>{{ t('desktop.agent.statusDescription') }}</small></div>
          <NTag :bordered="false" :type="dataSettings.runtimeState.value.status === 'ready' ? 'success' : 'warning'">
            {{ t(`runtime.status.${dataSettings.runtimeState.value.status}`) }}
          </NTag>
        </div>
        <div class="desktop-data-settings__row">
          <div><strong>{{ t('desktop.agent.currentModel') }}</strong></div>
          <span>{{ dataSettings.selectedModel.value?.displayName ?? t('desktop.agent.noModel') }}</span>
        </div>
      </div>
      <DesktopRuntimeRecovery
        v-if="dataSettings.runtimeState.value.status === 'offline'"
        :backups="dataSettings.runtimeDataBackups.value"
        :backup-storage="dataSettings.runtimeDataBackupStorage.value"
        :can-cancel-data-operation="dataSettings.canCancelRuntimeDataOperation.value"
        :can-create-backup="dataSettings.canCreateRuntimeBackup.value"
        :can-open-data-directory="dataSettings.canOpenRuntimeDataDirectory.value"
        :can-restart="dataSettings.canRestartRuntime.value"
        :failure-code="dataSettings.runtimeState.value.lastError"
        :failure-message="dataSettings.runtimeError.value ?? t('desktop.agent.runtimeUnknownFailure')"
        :is-creating-backup="dataSettings.isCreatingRuntimeBackup.value"
        :deleting-backup-id="dataSettings.deletingRuntimeBackupId.value"
        :is-loading-backups="dataSettings.isLoadingRuntimeBackups.value"
        :is-opening-data-directory="dataSettings.isOpeningRuntimeDataDirectory.value"
        :language="dataSettings.language.value"
        :latest-backup-path="dataSettings.latestRuntimeBackupPath.value"
        :latest-restore-safety-backup-path="dataSettings.latestRuntimeRestore.value?.safetyBackup.path ?? null"
        :data-operation="dataSettings.runtimeDataOperation.value"
        :pid="dataSettings.runtimeState.value.pid"
        :recovery-error="dataSettings.runtimeRecoveryError.value"
        :restoring-backup-id="dataSettings.restoringRuntimeBackupId.value"
        :validating-backup-id="dataSettings.validatingRuntimeBackupId.value"
        @create-backup="dataSettings.createRuntimeDataBackup"
        @cancel-data-operation="dataSettings.cancelRuntimeDataOperation"
        @delete-backup="dataSettings.deleteRuntimeDataBackup"
        @open-data-directory="dataSettings.openRuntimeDataDirectory"
        @restart="dataSettings.restartRuntime"
        @restore-backup="dataSettings.restoreRuntimeDataBackup"
        @validate-backup="dataSettings.validateRuntimeDataBackup"
      />
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
        <h2>{{ t('desktop.settings.logsAndDiagnostics') }}</h2>
        <p>{{ t('desktop.settings.logsAndDiagnosticsDescription') }}</p>
      </div>
      <DesktopRunLogSection :data-settings="dataSettings" />
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
  border: 1px solid var(--buddy-border-light);
  border-radius: 0.65rem;
  background: var(--buddy-bg-surface);
}

.desktop-data-settings__row {
  display: flex;
  min-height: 4rem;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--buddy-border-light);
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
    border-right: 1px solid var(--buddy-border-light);
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
