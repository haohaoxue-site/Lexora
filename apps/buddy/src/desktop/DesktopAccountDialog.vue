<script setup lang="ts">
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { NButton, NModal } from 'naive-ui'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopAccountAvatar from './DesktopAccountAvatar.vue'

const props = defineProps<{
  language: BuddyLocale
  show: boolean
}>()
const emit = defineEmits<{
  'update:show': [show: boolean]
}>()

const { t } = useBuddyI18n(() => props.language)
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    class="desktop-account-dialog"
    :style="{ width: 'min(25rem, calc(100vw - 2rem))' }"
    :title="t('desktop.account.loginTitle')"
    @update:show="emit('update:show', $event)"
  >
    <div class="desktop-account-dialog__identity">
      <DesktopAccountAvatar size="medium" />
      <strong>{{ t('desktop.account.signedOut') }}</strong>
    </div>
    <p class="desktop-account-dialog__local-notice">
      {{ t('desktop.account.localNotice') }}
    </p>

    <template #footer>
      <NButton block type="primary">
        {{ t('desktop.account.loginAction') }}
      </NButton>
    </template>
  </NModal>
</template>

<style scoped>
.desktop-account-dialog__identity {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.desktop-account-dialog__identity strong {
  color: var(--buddy-text-primary);
  font-size: 0.9rem;
  font-weight: 600;
}

.desktop-account-dialog__local-notice {
  margin: 1rem 0 0;
  border-radius: var(--buddy-radius-micro);
  background: var(--buddy-fill-light);
  color: var(--buddy-text-secondary);
  font-size: 0.78rem;
  line-height: 1.6;
  padding: 0.75rem 0.85rem;
}
</style>
