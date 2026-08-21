<script setup lang="ts">
import type { DesktopAppInfo } from '../../electron/shared/desktopApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { NButton, NModal } from 'naive-ui'
import { DESKTOP_ASSET_URLS } from '@/assets/desktopAssetUrls'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  appInfo: DesktopAppInfo | null
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
    class="desktop-about-dialog"
    :style="{ width: 'min(23rem, calc(100vw - 2rem))' }"
    :title="t('desktop.about.title')"
    @update:show="emit('update:show', $event)"
  >
    <div class="desktop-about-dialog__identity">
      <img :src="DESKTOP_ASSET_URLS.appIcon" alt="" draggable="false">
      <strong>Lexora Buddy</strong>
    </div>
    <div class="desktop-about-dialog__versions">
      <p>{{ t('desktop.about.version', { version: appInfo?.version ?? '—' }) }}</p>
      <p>{{ t('desktop.about.electron', { version: appInfo?.electronVersion ?? '—' }) }}</p>
      <p>{{ t('desktop.about.chromium', { version: appInfo?.chromiumVersion ?? '—' }) }}</p>
      <p>{{ t('desktop.about.node', { version: appInfo?.nodeVersion ?? '—' }) }}</p>
    </div>
    <template #footer>
      <NButton block type="primary" @click="emit('update:show', false)">
        {{ t('common.confirm') }}
      </NButton>
    </template>
  </NModal>
</template>

<style scoped>
.desktop-about-dialog__identity {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.65rem;
  padding: 0.15rem 0 1.1rem;

  img {
    width: 3.25rem;
    height: 3.25rem;
    border-radius: 0.8rem;
  }

  strong {
    color: var(--buddy-text-primary);
    font-family: var(--buddy-font-mono);
    font-size: 1.15rem;
    letter-spacing: 0.03em;
  }
}

.desktop-about-dialog__versions {
  display: grid;
  gap: 0.2rem;
  border-top: 1px solid var(--buddy-border-light);
  padding: 1rem 0 0.25rem;

  p {
    margin: 0;
    color: var(--buddy-text-secondary);
    font-family: var(--buddy-font-mono);
    font-size: 0.78rem;
    line-height: 1.65;
  }
}
</style>
