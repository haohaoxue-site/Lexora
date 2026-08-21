<script setup lang="ts">
import type { DesktopChatController } from './useDesktopChat'
import { NAlert, NTag } from 'naive-ui'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { createDesktopAgentUsage } from './desktopAgentUsage'
import DesktopRunLogSection from './DesktopRunLogSection.vue'
import DesktopRuntimeRecovery from './DesktopRuntimeRecovery.vue'
import DesktopRuntimeRecoveryNotice from './DesktopRuntimeRecoveryNotice.vue'

const props = defineProps<{ chat: DesktopChatController }>()
const chat = props.chat
const { t } = useBuddyI18n(chat.language)
const usage = computed(() => createDesktopAgentUsage(chat.usageSnapshot.value))

function formatNumber(value: number) {
  return new Intl.NumberFormat(chat.language.value, {
    maximumFractionDigits: 1,
    notation: value >= 10_000 ? 'compact' : 'standard',
  }).format(value)
}
</script>

<template>
  <div class="desktop-data-settings">
    <NAlert v-if="chat.agentError.value || chat.usageError.value" type="error" :show-icon="false">
      {{ chat.agentError.value ?? chat.usageError.value }}
    </NAlert>

    <DesktopRuntimeRecoveryNotice
      v-if="chat.runtimeDataRecoveryReceipt.value"
      :language="chat.language.value"
      :receipt="chat.runtimeDataRecoveryReceipt.value"
    />

    <section class="desktop-data-settings__section">
      <div class="desktop-data-settings__heading">
        <h2>{{ t('desktop.settings.runtimeAndRecovery') }}</h2>
        <p>{{ t('desktop.settings.runtimeAndRecoveryDescription') }}</p>
      </div>
      <div class="desktop-data-settings__group">
        <div class="desktop-data-settings__row">
          <div><strong>{{ t('desktop.agent.statusTitle') }}</strong><small>{{ t('desktop.agent.statusDescription') }}</small></div>
          <NTag :bordered="false" :type="chat.runtimeState.value.status === 'ready' ? 'success' : 'warning'">
            {{ t(`runtime.status.${chat.runtimeState.value.status}`) }}
          </NTag>
        </div>
        <div class="desktop-data-settings__row">
          <div><strong>{{ t('desktop.agent.currentModel') }}</strong></div>
          <span>{{ chat.selectedModel.value?.displayName ?? t('desktop.agent.noModel') }}</span>
        </div>
      </div>
      <DesktopRuntimeRecovery
        v-if="chat.runtimeState.value.status === 'offline'"
        :backups="chat.runtimeDataBackups.value"
        :backup-storage="chat.runtimeDataBackupStorage.value"
        :can-cancel-data-operation="chat.canCancelRuntimeDataOperation.value"
        :can-create-backup="chat.canCreateRuntimeBackup.value"
        :can-open-data-directory="chat.canOpenRuntimeDataDirectory.value"
        :can-restart="chat.canRestartRuntime.value"
        :failure-code="chat.runtimeState.value.lastError"
        :failure-message="chat.runtimeError.value ?? t('desktop.agent.runtimeUnknownFailure')"
        :is-creating-backup="chat.isCreatingRuntimeBackup.value"
        :deleting-backup-id="chat.deletingRuntimeBackupId.value"
        :is-loading-backups="chat.isLoadingRuntimeBackups.value"
        :is-opening-data-directory="chat.isOpeningRuntimeDataDirectory.value"
        :language="chat.language.value"
        :latest-backup-path="chat.latestRuntimeBackupPath.value"
        :latest-restore-safety-backup-path="chat.latestRuntimeRestore.value?.safetyBackup.path ?? null"
        :data-operation="chat.runtimeDataOperation.value"
        :pid="chat.runtimeState.value.pid"
        :recovery-error="chat.runtimeRecoveryError.value"
        :restoring-backup-id="chat.restoringRuntimeBackupId.value"
        :validating-backup-id="chat.validatingRuntimeBackupId.value"
        @create-backup="chat.createRuntimeDataBackup"
        @cancel-data-operation="chat.cancelRuntimeDataOperation"
        @delete-backup="chat.deleteRuntimeDataBackup"
        @open-data-directory="chat.openRuntimeDataDirectory"
        @restart="chat.restartRuntime"
        @restore-backup="chat.restoreRuntimeDataBackup"
        @validate-backup="chat.validateRuntimeDataBackup"
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
      <DesktopRunLogSection :chat="chat" />
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
