<script setup lang="ts">
import type { WebSettingsCapability } from './useWebSettingsCapability'
import { NAlert, NButton, NSkeleton } from 'naive-ui'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopTavilySettings from './DesktopTavilySettings.vue'
import DesktopWebFetchSettings from './DesktopWebFetchSettings.vue'
import DesktopWebSearchSettings from './DesktopWebSearchSettings.vue'

const props = defineProps<{ capability: WebSettingsCapability }>()
const { t } = useBuddyI18n(props.capability.language)
</script>

<template>
  <section class="desktop-web-settings">
    <NAlert v-if="capability.error.value" type="error" :show-icon="false">
      {{ capability.error.value }}
      <NButton text :disabled="capability.busy.value" @click="capability.load()">
        {{ t('desktop.agent.retry') }}
      </NButton>
    </NAlert>
    <template v-if="capability.snapshot.value">
      <DesktopWebSearchSettings
        :sources="capability.searchSources.value"
        :disabled="capability.busy.value"
        :language="capability.language.value"
        @toggle="capability.setSearchEnabled"
        @reorder="capability.reorderSearch"
      />
      <DesktopWebFetchSettings
        :settings="capability.snapshot.value.settings.fetch"
        :tavily-key-configured="capability.snapshot.value.tavilyKeyConfigured"
        :disabled="capability.busy.value"
        :language="capability.language.value"
        @toggle="capability.setFetchEnabled"
      />
      <section class="desktop-web-settings__services">
        <h2 class="desktop-web-settings__title">
          {{ t('desktop.web.services') }}
        </h2>
        <DesktopTavilySettings
          :configured="capability.snapshot.value.tavilyKeyConfigured"
          :disabled="capability.busy.value"
          :language="capability.language.value"
          :save-credential="capability.saveCredential"
          :reveal-credential="capability.revealCredential"
        />
      </section>
    </template>
    <NSkeleton v-else-if="capability.busy.value" text :repeat="6" />
  </section>
</template>

<style scoped lang="scss">
.desktop-web-settings { display: grid; gap: 2rem; }
.desktop-web-settings__services { display: grid; gap: 1rem; }
.desktop-web-settings__title { margin: 0; font-size: 0.92rem; font-weight: 600; }
</style>
