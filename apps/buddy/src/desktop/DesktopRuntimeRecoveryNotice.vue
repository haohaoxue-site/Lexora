<script setup lang="ts">
import type { LocalRuntimeDataRecoveryReceipt } from '../../electron/shared/localChatApi'
import type { BuddyI18nKey, BuddyLocale } from '@/i18n/buddyI18n'
import { NAlert } from 'naive-ui'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  language: BuddyLocale
  receipt: LocalRuntimeDataRecoveryReceipt
}>()
const { t } = useBuddyI18n(() => props.language)
const recoveryMessageKeys = {
  discarded_incomplete_backup: 'desktop.agent.runtimeRecoveryReceipt.discardedIncompleteBackup',
  discarded_restore_candidate: 'desktop.agent.runtimeRecoveryReceipt.discardedRestoreCandidate',
  kept_restored_data: 'desktop.agent.runtimeRecoveryReceipt.keptRestoredData',
  restored_previous_data: 'desktop.agent.runtimeRecoveryReceipt.restoredPreviousData',
} as const satisfies Record<LocalRuntimeDataRecoveryReceipt['action'], BuddyI18nKey>
const completedAt = computed(() => new Intl.DateTimeFormat(props.language, {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(props.receipt.completedAt)))
</script>

<template>
  <NAlert
    type="warning"
    :data-runtime-recovery-action="receipt.action"
    :show-icon="false"
  >
    {{ t(recoveryMessageKeys[receipt.action], { time: completedAt }) }}
  </NAlert>
</template>
