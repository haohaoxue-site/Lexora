<script setup lang="ts">
import type { DesktopUpdateCheckResult } from '@buddy-electron/shared/desktopApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { NButton, NModal } from 'naive-ui'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  language: BuddyLocale
  result: DesktopUpdateCheckResult | null
  show: boolean
}>()
const emit = defineEmits<{
  'openRelease': [url: string]
  'update:show': [show: boolean]
}>()
const { t } = useBuddyI18n(() => props.language)
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    class="desktop-update-dialog"
    :style="{ width: 'min(26rem, calc(100vw - 2rem))' }"
    :title="t('desktop.update.title')"
    @update:show="emit('update:show', $event)"
  >
    <template v-if="result">
      <p class="desktop-update-dialog__status">
        {{ result.status === 'up_to_date'
          ? t('desktop.update.latest')
          : t('desktop.update.available') }}
      </p>
      <dl class="desktop-update-dialog__versions">
        <div>
          <dt>{{ t('desktop.update.currentVersion') }}</dt>
          <dd>{{ result.currentVersion }}</dd>
        </div>
        <div>
          <dt>{{ t('desktop.update.latestVersion') }}</dt>
          <dd>{{ result.latestVersion }}</dd>
        </div>
      </dl>
    </template>
    <template #footer>
      <div class="desktop-update-dialog__actions">
        <NButton @click="emit('update:show', false)">
          {{ t('common.confirm') }}
        </NButton>
        <NButton
          v-if="result?.status === 'update_available'"
          type="primary"
          @click="emit('openRelease', result.releaseUrl)"
        >
          {{ t('desktop.update.openRelease') }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.desktop-update-dialog__status {
  margin: 0 0 1rem;
  color: var(--buddy-text-regular);
  font-size: 0.86rem;
}

.desktop-update-dialog__versions {
  display: grid;
  gap: 0.5rem;
  margin: 0;
}

.desktop-update-dialog__versions div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.desktop-update-dialog__versions dt {
  color: var(--buddy-text-secondary);
  font-size: 0.76rem;
}

.desktop-update-dialog__versions dd {
  margin: 0;
  color: var(--buddy-text-regular);
  font-family: var(--buddy-font-mono);
  font-size: 0.76rem;
}

.desktop-update-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
}
</style>
