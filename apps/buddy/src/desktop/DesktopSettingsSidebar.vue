<script setup lang="ts">
import type { DesktopSettingsCategory } from './desktopViewState'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import {
  AnimalCat20Regular,
  Apps20Regular,
  Bot20Regular,
  DataUsage20Regular,
  Folder20Regular,
  PanelLeft20Regular,
} from '@vicons/fluent'
import { NButton, NIcon } from 'naive-ui'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  activeCategory: DesktopSettingsCategory
  appSidebarCollapsed: boolean
  language: BuddyLocale
}>()
const emit = defineEmits<{
  navigate: [category: DesktopSettingsCategory]
  toggleAppSidebar: []
}>()
const { t } = useBuddyI18n(() => props.language)
const categories = [
  { icon: Apps20Regular, key: 'app' as const },
  { icon: Bot20Regular, key: 'models' as const },
  { icon: AnimalCat20Regular, key: 'pet' as const },
  { icon: Folder20Regular, key: 'local' as const },
  { icon: DataUsage20Regular, key: 'data' as const },
]
</script>

<template>
  <nav class="desktop-settings-sidebar">
    <header class="desktop-settings-sidebar__header">
      <NButton
        v-if="appSidebarCollapsed"
        class="buddy-icon-button"
        quaternary
        @click="emit('toggleAppSidebar')"
      >
        <template #icon>
          <NIcon :component="PanelLeft20Regular" />
        </template>
      </NButton>
      <strong>{{ t('desktop.navigation.settings') }}</strong>
    </header>

    <div class="desktop-settings-sidebar__content">
      <button
        v-for="category in categories"
        :key="category.key"
        type="button"
        :class="{ 'is-active': activeCategory === category.key }"
        @click="emit('navigate', category.key)"
      >
        <NIcon :component="category.icon" />
        <span>{{ t(`desktop.settings.category.${category.key}`) }}</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.desktop-settings-sidebar {
  display: flex;
  width: var(--buddy-workspace-sidebar-width);
  height: 100%;
  min-height: 0;
  flex: none;
  flex-direction: column;
  border-right: 1px solid var(--buddy-border-light);
  background: var(--buddy-bg-workspace-sidebar);
}

.desktop-settings-sidebar__header {
  display: flex;
  height: var(--buddy-region-header-height);
  flex: none;
  align-items: center;
  gap: 0.35rem;
  border-bottom: 1px solid var(--buddy-border-light);
  padding: 0 0.75rem;
}

.desktop-settings-sidebar__header strong {
  overflow: hidden;
  font-size: var(--buddy-sidebar-header-font-size);
  font-weight: var(--buddy-sidebar-header-font-weight);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-settings-sidebar__content {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.2rem;
  overflow-y: auto;
  padding: 0.9rem 0.7rem;
}

.desktop-settings-sidebar__content > button {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.65rem;
  border: 0;
  border-radius: 0.45rem;
  background: transparent;
  color: var(--buddy-text-regular);
  cursor: pointer;
  font-size: var(--buddy-sidebar-item-font-size);
  font-weight: var(--buddy-sidebar-item-font-weight);
  line-height: 20px;
  padding: 0.55rem 0.65rem;
  text-align: left;
}

.desktop-settings-sidebar__content > button:hover {
  background: var(--buddy-fill-base);
}

.desktop-settings-sidebar__content > button.is-active {
  background: var(--buddy-nav-active-bg);
  color: var(--buddy-text-primary);
  font-weight: var(--buddy-sidebar-item-active-font-weight);
}
</style>
