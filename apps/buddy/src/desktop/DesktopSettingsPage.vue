<script setup lang="ts">
import type { DesktopAppInfo } from '../../electron/shared/desktopApi'
import type { DesktopSettingsCategory } from './desktopViewState'
import type { DesktopChatController } from './useDesktopChat'
import { NSwitch } from 'naive-ui'
import { computed, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopConnectorsSettingsTab from './DesktopConnectorsSettingsTab.vue'
import DesktopDataSettings from './DesktopDataSettings.vue'
import DesktopGeneralSettingsTab from './DesktopGeneralSettingsTab.vue'
import DesktopModelsSettings from './DesktopModelsSettings.vue'
import DesktopPetSettings from './DesktopPetSettings.vue'
import DesktopSkillsSettingsTab from './DesktopSkillsSettingsTab.vue'

const props = defineProps<{
  activeCategory: DesktopSettingsCategory
  appInfo: DesktopAppInfo | null
  chat: DesktopChatController
}>()
const chat = props.chat
const { t } = useBuddyI18n(chat.language)
const selectedProviderId = shallowRef<string | null>(null)
const selectedProvider = computed(() => chat.providers.value.find(
  provider => provider.id === selectedProviderId.value,
) ?? null)
const providerSummary = computed(() => {
  const provider = selectedProvider.value
  return provider ? [provider.id, provider.description].filter(Boolean).join(' | ') : ''
})

watch(() => props.activeCategory, (category) => {
  if (category !== 'models')
    selectedProviderId.value = null
})
</script>

<template>
  <section class="desktop-settings-page">
    <header class="desktop-settings-page__header">
      <div class="desktop-settings-page__header-copy">
        <h1 v-if="selectedProvider" class="desktop-settings-page__breadcrumb">
          <button type="button" @click="selectedProviderId = null">
            {{ t('desktop.settings.category.models') }}
          </button>
          <span>/</span>
          <span>{{ selectedProvider.displayName }}</span>
        </h1>
        <h1 v-else>
          {{ t(`desktop.settings.category.${activeCategory}`) }}
        </h1>
        <p v-if="selectedProvider">
          {{ providerSummary }}
        </p>
        <p v-else>
          {{ t(`desktop.settings.categoryDescription.${activeCategory}`) }}
        </p>
      </div>
      <NSwitch
        v-if="selectedProvider"
        :value="selectedProvider.enabled"
        :disabled="selectedProvider.activeRunCount > 0 || (!selectedProvider.enabled && !selectedProvider.setupComplete)"
        @update:value="chat.setProviderEnabled(selectedProvider.id, $event)"
      />
    </header>

    <div class="desktop-settings-page__scroll">
      <div class="desktop-settings-page__content">
        <DesktopGeneralSettingsTab
          v-if="activeCategory === 'app'"
          :app-info="appInfo"
          :chat="chat"
        />
        <DesktopModelsSettings
          v-else-if="activeCategory === 'models'"
          v-model:selected-provider-id="selectedProviderId"
          :chat="chat"
        />
        <DesktopPetSettings
          v-else-if="activeCategory === 'pet'"
          :chat="chat"
        />
        <div v-else-if="activeCategory === 'local'" class="desktop-settings-page__local">
          <DesktopSkillsSettingsTab :chat="chat" />
          <DesktopConnectorsSettingsTab :chat="chat" />
        </div>
        <DesktopDataSettings v-else-if="activeCategory === 'data'" :chat="chat" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.desktop-settings-page {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  background: var(--buddy-bg-surface);
}

.desktop-settings-page__header {
  display: flex;
  height: var(--buddy-region-header-height);
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--buddy-border-light);
  padding: 0 1.1rem;
}

.desktop-settings-page__header-copy {
  display: grid;
  min-width: 0;
  gap: 0.08rem;
}

.desktop-settings-page__breadcrumb {
  display: flex;
  min-width: 0;
  align-items: center;
}

.desktop-settings-page__breadcrumb button {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-weight: inherit;
  padding: 0;
}

.desktop-settings-page__breadcrumb button:hover {
  color: var(--buddy-accent-primary);
}

.desktop-settings-page__breadcrumb button:focus-visible {
  border-radius: var(--buddy-radius-micro);
  outline: 2px solid var(--buddy-accent-primary);
  outline-offset: 2px;
}

.desktop-settings-page__breadcrumb span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-settings-page__header h1,
.desktop-settings-page__header p {
  overflow: hidden;
  margin: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-settings-page__header h1 {
  font-size: 0.88rem;
  font-weight: 660;
}

.desktop-settings-page__header p {
  color: var(--buddy-text-secondary);
  font-size: 0.68rem;
}

.desktop-settings-page__scroll {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: clamp(1.4rem, 3vw, 2.8rem);
}

.desktop-settings-page__content {
  display: grid;
  width: min(100%, 64rem);
  gap: 1.8rem;
  margin: 0 auto;
  padding-bottom: 3rem;
}

.desktop-settings-page__local {
  display: grid;
  gap: 2rem;
}
</style>
