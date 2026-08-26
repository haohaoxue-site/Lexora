<script setup lang="ts">
import type { LocalRuntimeDataBackup } from '@buddy-electron/shared/localChatApi'
import type { BuddyI18nKey, BuddyLocale } from '@/i18n/buddyI18n'
import { NButton, NEmpty, NPopconfirm, NSpin, NTag } from 'naive-ui'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  backups: ReadonlyArray<LocalRuntimeDataBackup>
  deletingBackupId: string | null
  isCreatingBackup: boolean
  isLoading: boolean
  language: BuddyLocale
  restoringBackupId: string | null
  validatingBackupId: string | null
}>()
const emit = defineEmits<{
  delete: [backupId: string]
  restore: [backupId: string]
  validate: [backupId: string]
}>()
const { t } = useBuddyI18n(() => props.language)

const statusMessageKeys = {
  invalid: 'desktop.agent.runtimeBackupStatus.invalid',
  unverified: 'desktop.agent.runtimeBackupStatus.unverified',
  valid: 'desktop.agent.runtimeBackupStatus.valid',
} as const satisfies Record<LocalRuntimeDataBackup['status'], BuddyI18nKey>
const purposeMessageKeys = {
  manual: 'desktop.agent.runtimeBackupPurpose.manual',
  pre_restore: 'desktop.agent.runtimeBackupPurpose.preRestore',
} as const satisfies Record<NonNullable<LocalRuntimeDataBackup['purpose']>, BuddyI18nKey>

function formatDate(value: string | null): string {
  if (!value)
    return t('desktop.agent.runtimeBackupStatus.invalid')
  return new Intl.DateTimeFormat(props.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatBytes(value: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = value
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${new Intl.NumberFormat(props.language, { maximumFractionDigits: 1 }).format(size)} ${units[unit]}`
}

function statusType(status: LocalRuntimeDataBackup['status']) {
  if (status === 'valid')
    return 'success' as const
  if (status === 'invalid')
    return 'error' as const
  return 'warning' as const
}
</script>

<template>
  <section class="desktop-runtime-backups">
    <h3 class="desktop-runtime-backups__title">
      {{ t('desktop.agent.runtimeBackupListTitle') }}
    </h3>
    <NSpin :show="isLoading">
      <NEmpty
        v-if="!backups.length"
        size="small"
        :description="t('desktop.agent.runtimeBackupEmpty')"
      />
      <ul v-else class="desktop-runtime-backups__list">
        <li
          v-for="backup in backups"
          :key="backup.id"
          class="desktop-runtime-backups__item"
        >
          <div class="desktop-runtime-backups__summary">
            <div class="desktop-runtime-backups__heading">
              <strong>{{ formatDate(backup.createdAt) }}</strong>
              <NTag :bordered="false" size="small" :type="statusType(backup.status)">
                {{ t(statusMessageKeys[backup.status]) }}
              </NTag>
              <NTag v-if="backup.purpose" :bordered="false" size="small">
                {{ t(purposeMessageKeys[backup.purpose]) }}
              </NTag>
            </div>
            <code>{{ backup.id }}</code>
            <small>
              {{ t('desktop.agent.runtimeBackupMetadata', {
                count: backup.fileCount,
                size: formatBytes(backup.totalBytes),
              }) }}
            </small>
            <small
              v-if="backup.status === 'valid' && backup.restoreCapacity"
              :class="{
                'desktop-runtime-backups__capacity--insufficient':
                  !backup.restoreCapacity.sufficient,
              }"
            >
              {{ t(backup.restoreCapacity.sufficient
                ? 'desktop.agent.runtimeRestoreCapacityReady'
                : 'desktop.agent.runtimeRestoreCapacityInsufficient') }}
            </small>
          </div>
          <div class="desktop-runtime-backups__actions">
            <NButton
              v-if="backup.status === 'unverified'
                || (backup.status === 'valid' && !backup.restoreCapacity?.sufficient)"
              size="small"
              :loading="validatingBackupId === backup.id"
              :disabled="isCreatingBackup
                || deletingBackupId !== null
                || restoringBackupId !== null
                || validatingBackupId !== null"
              @click="emit('validate', backup.id)"
            >
              {{ t(backup.status === 'valid'
                ? 'desktop.agent.runtimeBackupRevalidate'
                : 'desktop.agent.runtimeBackupValidate') }}
            </NButton>
            <NPopconfirm
              v-if="backup.status === 'valid' && backup.restoreCapacity?.sufficient"
              :positive-text="t('desktop.agent.runtimeBackupRestore')"
              :negative-text="t('common.cancel')"
              @positive-click="emit('restore', backup.id)"
            >
              <template #trigger>
                <NButton
                  size="small"
                  type="error"
                  ghost
                  :loading="restoringBackupId === backup.id"
                  :disabled="isCreatingBackup
                    || deletingBackupId !== null
                    || restoringBackupId !== null
                    || validatingBackupId !== null"
                >
                  {{ t('desktop.agent.runtimeBackupRestore') }}
                </NButton>
              </template>
              <strong>{{ t('desktop.agent.runtimeRestoreConfirm') }}</strong>
              <p class="desktop-runtime-backups__confirmation">
                {{ t('desktop.agent.runtimeRestoreDescription') }}
              </p>
            </NPopconfirm>
            <NPopconfirm
              :positive-text="t('desktop.agent.runtimeBackupDelete')"
              :negative-text="t('common.cancel')"
              @positive-click="emit('delete', backup.id)"
            >
              <template #trigger>
                <NButton
                  size="small"
                  type="error"
                  quaternary
                  :loading="deletingBackupId === backup.id"
                  :disabled="isCreatingBackup
                    || deletingBackupId !== null
                    || restoringBackupId !== null
                    || validatingBackupId !== null"
                >
                  {{ t('desktop.agent.runtimeBackupDelete') }}
                </NButton>
              </template>
              <strong>{{ t('desktop.agent.runtimeBackupDeleteConfirm') }}</strong>
              <p class="desktop-runtime-backups__confirmation">
                {{ t(backup.purpose === 'pre_restore'
                  ? 'desktop.agent.runtimeBackupDeleteDescription.preRestore'
                  : 'desktop.agent.runtimeBackupDeleteDescription.manual') }}
              </p>
            </NPopconfirm>
          </div>
        </li>
      </ul>
    </NSpin>
  </section>
</template>

<style scoped lang="scss">
.desktop-runtime-backups {
  display: grid;
  gap: 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid var(--buddy-border-subtle);
}

.desktop-runtime-backups__title {
  margin: 0;
  font-size: 0.88rem;
}

.desktop-runtime-backups__list {
  display: grid;
  gap: 0.65rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.desktop-runtime-backups__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.8rem;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 0.75rem;
  background: var(--buddy-surface-subtle);
}

.desktop-runtime-backups__summary {
  display: grid;
  min-width: 0;
  gap: 0.25rem;

  code,
  small {
    color: var(--buddy-text-muted);
    font-size: 0.72rem;
  }

  code {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.desktop-runtime-backups__heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;

  strong {
    font-size: 0.82rem;
  }
}

.desktop-runtime-backups__actions {
  display: flex;
  flex: none;
  gap: 0.5rem;
}

.desktop-runtime-backups__capacity--insufficient {
  color: var(--buddy-status-danger-text);
}

.desktop-runtime-backups__confirmation {
  max-width: 24rem;
  margin: 0.4rem 0 0;
  color: var(--buddy-text-secondary);
  line-height: 1.5;
}

@media (max-width: 620px) {
  .desktop-runtime-backups__item {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
