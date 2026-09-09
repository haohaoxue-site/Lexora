<script setup lang="ts">
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { NButton } from 'naive-ui'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopStartupArtwork from './DesktopStartupArtwork.vue'

const props = defineProps<{ failed: boolean, language: BuddyLocale }>()
const emit = defineEmits<{ retry: [], openLogs: [] }>()
const { t } = useBuddyI18n(() => props.language)
</script>

<template>
  <div class="desktop-startup" :class="{ 'is-failed': failed }" :role="failed ? 'alert' : 'status'" :aria-busy="!failed">
    <DesktopStartupArtwork :still="failed" />
    <div class="desktop-startup__identity">
      <h1>Lexora Buddy</h1>
      <p>{{ t(failed ? 'desktop.loading.failed' : 'desktop.loading.app') }}</p>
      <div v-if="failed" class="desktop-startup__actions">
        <NButton size="small" secondary @click="emit('retry')">
          {{ t('desktop.loading.retry') }}
        </NButton>
        <NButton size="small" quaternary @click="emit('openLogs')">
          {{ t('applicationLogs.open') }}
        </NButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.desktop-startup {
  --startup-avatar-size: clamp(10rem, 26vmin, 15rem);
  position: absolute;
  z-index: 20;
  inset: 0;
  overflow: hidden;
  background: var(--buddy-surface-base);
  user-select: none;
}

.desktop-startup__identity {
  position: absolute;
  top: calc(50% + var(--startup-avatar-size) / 2 + 1rem);
  left: 50%;
  display: grid;
  width: min(28rem, calc(100% - 3rem));
  justify-items: center;
  gap: 0.85rem;
  font-family: var(--buddy-font-brand);
  text-align: center;
  transform: translateX(-50%);
}

.desktop-startup h1 {
  margin: 0;
  color: var(--buddy-text-primary);
  font-size: 1.25rem;
  font-weight: 500;
  letter-spacing: 0.09em;
}

.desktop-startup p {
  margin: 0;
  color: var(--buddy-text-secondary);
  font-size: 0.75rem;
}

.desktop-startup__actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.4rem;
}
</style>
