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
    <div class="desktop-startup__identity">
      <DesktopStartupArtwork :still="failed" />
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
  position: absolute;
  z-index: 20;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: var(--buddy-surface-base);
}
.desktop-startup__identity { display: grid; justify-items: center; gap: 0.85rem; padding: 1.5rem; transform: translateY(-0.7rem); }
.desktop-startup h1 { margin: -0.5rem 0 0; color: var(--buddy-text-primary); font-size: 1.25rem; font-weight: 550; letter-spacing: 0.09em; }
.desktop-startup p { margin: 0; color: var(--buddy-text-secondary); font-size: 0.75rem; }
.desktop-startup__actions { display: flex; gap: 0.5rem; margin-top: 0.4rem; }
</style>
