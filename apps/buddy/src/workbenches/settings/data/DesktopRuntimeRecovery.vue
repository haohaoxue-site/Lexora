<script setup lang="ts">
import type {
  LocalRuntimeDataBackup,
  LocalRuntimeDataBackupStorage,
  LocalRuntimeDataOperation,
} from '@buddy-electron/shared/localChatApi'
import type { BuddyServiceSupervisorFailureCode } from '@buddy-shared/runtimeProtocol'
import type { BuddyI18nKey, BuddyLocale } from '@/i18n/buddyI18n'
import { NAlert, NButton, NProgress, NTag } from 'naive-ui'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopRuntimeBackupList from '@/workbenches/settings/data/DesktopRuntimeBackupList.vue'

const props = defineProps<{
  canCreateBackup: boolean
  canOpenDataDirectory: boolean
  canRestart: boolean
  backups: ReadonlyArray<LocalRuntimeDataBackup>
  backupStorage: LocalRuntimeDataBackupStorage | null
  canCancelDataOperation: boolean
  failureCode: BuddyServiceSupervisorFailureCode | null
  failureMessage: string
  isCreatingBackup: boolean
  deletingBackupId: string | null
  isLoadingBackups: boolean
  isOpeningDataDirectory: boolean
  language: BuddyLocale
  latestBackupPath: string | null
  latestRestoreSafetyBackupPath: string | null
  dataOperation: LocalRuntimeDataOperation | null
  pid: number | null
  recoveryError: string | null
  restoringBackupId: string | null
  validatingBackupId: string | null
}>()
const emit = defineEmits<{
  cancelDataOperation: []
  createBackup: []
  deleteBackup: [backupId: string]
  openDataDirectory: []
  restart: []
  restoreBackup: [backupId: string]
  validateBackup: [backupId: string]
}>()
const { t } = useBuddyI18n(() => props.language)
const operationStageMessageKeys = {
  cleaning_up: 'desktop.agent.runtimeOperationStage.cleaningUp',
  completed: 'desktop.agent.runtimeOperationStage.completed',
  copying_backup: 'desktop.agent.runtimeOperationStage.copyingBackup',
  copying_restore: 'desktop.agent.runtimeOperationStage.copyingRestore',
  creating_safety_backup: 'desktop.agent.runtimeOperationStage.creatingSafetyBackup',
  moving_current_data: 'desktop.agent.runtimeOperationStage.movingCurrentData',
  preparing: 'desktop.agent.runtimeOperationStage.preparing',
  publishing: 'desktop.agent.runtimeOperationStage.publishing',
  publishing_restored_data: 'desktop.agent.runtimeOperationStage.publishingRestoredData',
  verifying_backup: 'desktop.agent.runtimeOperationStage.verifyingBackup',
  verifying_restore: 'desktop.agent.runtimeOperationStage.verifyingRestore',
} as const satisfies Record<LocalRuntimeDataOperation['stage'], BuddyI18nKey>
const activeDataOperation = computed(() => {
  const operation = props.dataOperation
  return operation && ['running', 'cancelling'].includes(operation.status)
    ? operation
    : null
})
const operationPercentage = computed(() => {
  const operation = activeDataOperation.value
  if (!operation?.totalBytes)
    return 0
  return Math.min(100, Math.round(operation.completedBytes / operation.totalBytes * 100))
})

function formatBytes(value: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = value
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${new Intl.NumberFormat(props.language, {
    maximumFractionDigits: 1,
  }).format(size)} ${units[unit]}`
}
</script>

<template>
  <section class="desktop-runtime-recovery">
    <header class="desktop-runtime-recovery__header">
      <div>
        <h2 class="desktop-runtime-recovery__title">
          {{ t('desktop.agent.runtimeRecoveryTitle') }}
        </h2>
        <p class="desktop-runtime-recovery__message">
          {{ failureMessage }}
        </p>
      </div>
      <NTag :bordered="false" type="error">
        {{ t('runtime.status.offline') }}
      </NTag>
    </header>

    <dl class="desktop-runtime-recovery__diagnostics">
      <div class="desktop-runtime-recovery__diagnostic">
        <dt class="desktop-runtime-recovery__diagnostic-label">
          {{ t('desktop.agent.runtimeFailureCode') }}
        </dt>
        <dd class="desktop-runtime-recovery__diagnostic-value">
          <code>{{ failureCode ?? t('desktop.agent.runtimeUnknownFailure') }}</code>
        </dd>
      </div>
      <div v-if="pid !== null" class="desktop-runtime-recovery__diagnostic">
        <dt class="desktop-runtime-recovery__diagnostic-label">
          {{ t('desktop.agent.runtimeProcessId') }}
        </dt>
        <dd class="desktop-runtime-recovery__diagnostic-value">
          <code>{{ pid }}</code>
        </dd>
      </div>
    </dl>

    <NAlert v-if="pid !== null" type="error" :show-icon="false">
      {{ t('desktop.agent.runtimeProcessStillRunning', { pid }) }}
    </NAlert>
    <p v-else class="desktop-runtime-recovery__description">
      {{ t('desktop.agent.runtimeRecoveryDescription') }}
    </p>

    <div class="desktop-runtime-recovery__actions">
      <NButton
        v-if="pid === null"
        secondary
        :disabled="!canRestart"
        @click="emit('restart')"
      >
        {{ t('desktop.agent.runtimeRestart') }}
      </NButton>
      <NButton
        secondary
        :loading="isOpeningDataDirectory"
        :disabled="!canOpenDataDirectory"
        @click="emit('openDataDirectory')"
      >
        {{ t('desktop.agent.runtimeOpenDataDirectory') }}
      </NButton>
      <NButton
        v-if="pid === null"
        type="primary"
        :loading="isCreatingBackup"
        :disabled="!canCreateBackup"
        @click="emit('createBackup')"
      >
        {{ t('desktop.agent.runtimeCreateBackup') }}
      </NButton>
    </div>

    <p v-if="pid === null" class="desktop-runtime-recovery__note">
      {{ t('desktop.agent.runtimeBackupDescription') }}
    </p>
    <dl v-if="backupStorage" class="desktop-runtime-recovery__storage">
      <div class="desktop-runtime-recovery__storage-item">
        <dt class="desktop-runtime-recovery__storage-label">
          {{ t('desktop.agent.runtimeBackupStorage') }}
        </dt>
        <dd class="desktop-runtime-recovery__storage-value">
          {{ t('desktop.agent.runtimeBackupStorageSummary', {
            count: backupStorage.backupCount,
            size: formatBytes(backupStorage.backupBytes),
            available: formatBytes(backupStorage.availableBytes),
          }) }}
        </dd>
      </div>
      <div class="desktop-runtime-recovery__storage-item">
        <dt class="desktop-runtime-recovery__storage-label">
          {{ t('desktop.agent.runtimeBackupCapacity') }}
        </dt>
        <dd class="desktop-runtime-recovery__storage-value">
          {{ t('desktop.agent.runtimeBackupCapacitySummary', {
            current: formatBytes(backupStorage.currentDataBytes),
            required: formatBytes(backupStorage.createBackupRequiredBytes),
          }) }}
        </dd>
      </div>
    </dl>
    <NAlert
      v-if="backupStorage && !backupStorage.canCreateBackup"
      type="warning"
      :show-icon="false"
    >
      {{ t('desktop.agent.runtimeBackupCapacityInsufficient', {
        available: formatBytes(backupStorage.availableBytes),
        required: formatBytes(backupStorage.createBackupRequiredBytes),
      }) }}
    </NAlert>
    <NAlert v-if="recoveryError" type="error" :show-icon="false">
      {{ recoveryError }}
    </NAlert>
    <section
      v-if="activeDataOperation"
      class="desktop-runtime-recovery__operation"
      aria-live="polite"
    >
      <div class="desktop-runtime-recovery__operation-heading">
        <strong>{{ t(operationStageMessageKeys[activeDataOperation.stage]) }}</strong>
        <NButton
          size="small"
          secondary
          :loading="activeDataOperation.status === 'cancelling'"
          :disabled="!canCancelDataOperation"
          @click="emit('cancelDataOperation')"
        >
          {{ t(activeDataOperation.status === 'cancelling'
            ? 'desktop.agent.runtimeOperationCancelling'
            : 'desktop.agent.runtimeOperationCancel') }}
        </NButton>
      </div>
      <NProgress
        type="line"
        :percentage="operationPercentage"
        :processing="activeDataOperation.totalBytes === null"
        :show-indicator="activeDataOperation.totalBytes !== null"
      />
      <small v-if="activeDataOperation.totalBytes !== null">
        {{ t('desktop.agent.runtimeOperationProgress', {
          completed: formatBytes(activeDataOperation.completedBytes),
          total: formatBytes(activeDataOperation.totalBytes),
        }) }}
      </small>
      <small
        v-if="!activeDataOperation.cancellable
          && activeDataOperation.status !== 'cancelling'"
      >
        {{ t('desktop.agent.runtimeOperationCommitBarrier') }}
      </small>
    </section>
    <NAlert v-if="latestBackupPath" type="success" :show-icon="false">
      {{ t('desktop.agent.runtimeBackupCreated', { path: latestBackupPath }) }}
    </NAlert>
    <NAlert v-if="latestRestoreSafetyBackupPath" type="success" :show-icon="false">
      {{ t('desktop.agent.runtimeRestoreSucceeded', { path: latestRestoreSafetyBackupPath }) }}
    </NAlert>

    <DesktopRuntimeBackupList
      v-if="pid === null"
      :backups="backups"
      :deleting-backup-id="deletingBackupId"
      :is-creating-backup="isCreatingBackup"
      :is-loading="isLoadingBackups"
      :language="language"
      :restoring-backup-id="restoringBackupId"
      :validating-backup-id="validatingBackupId"
      @delete="emit('deleteBackup', $event)"
      @restore="emit('restoreBackup', $event)"
      @validate="emit('validateBackup', $event)"
    />
  </section>
</template>

<style scoped lang="scss">
.desktop-runtime-recovery {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 1rem;
  background: var(--buddy-surface-raised);
}

.desktop-runtime-recovery__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.desktop-runtime-recovery__operation {
  display: grid;
  gap: 0.55rem;
  padding: 0.8rem;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 0.75rem;
  background: var(--buddy-surface-subtle);
}

.desktop-runtime-recovery__operation-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.desktop-runtime-recovery__title,
.desktop-runtime-recovery__message {
  margin: 0;
}

.desktop-runtime-recovery__title {
  font-size: 1rem;
}

.desktop-runtime-recovery__message {
  margin-top: 0.4rem;
  color: var(--buddy-text-secondary);
  font-size: 0.88rem;
  line-height: 1.55;
}

.desktop-runtime-recovery__diagnostics {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 2rem;
  margin: 0;
}

.desktop-runtime-recovery__diagnostic {
  display: grid;
  gap: 0.3rem;
}

.desktop-runtime-recovery__diagnostic-label {
  color: var(--buddy-text-muted);
  font-size: 0.75rem;
}

.desktop-runtime-recovery__diagnostic-value {
  margin: 0;
  color: var(--buddy-text-strong);
  font-size: 0.82rem;
}

.desktop-runtime-recovery__description,
.desktop-runtime-recovery__note {
  margin: 0;
  color: var(--buddy-text-secondary);
  font-size: 0.82rem;
  line-height: 1.55;
}

.desktop-runtime-recovery__storage {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 0;

}

.desktop-runtime-recovery__storage-item {
  display: grid;
  gap: 0.25rem;
  padding: 0.75rem;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 0.75rem;
  background: var(--buddy-surface-subtle);
}

.desktop-runtime-recovery__storage-label {
  color: var(--buddy-text-muted);
  font-size: 0.75rem;
}

.desktop-runtime-recovery__storage-value {
  margin: 0;
  color: var(--buddy-text-strong);
  font-size: 0.82rem;
  line-height: 1.5;
}

.desktop-runtime-recovery__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}

.desktop-runtime-recovery__note {
  color: var(--buddy-text-muted);
}

@media (max-width: 720px) {
  .desktop-runtime-recovery__header {
    align-items: stretch;
    flex-direction: column;
  }

  .desktop-runtime-recovery__storage {
    grid-template-columns: 1fr;
  }
}
</style>
