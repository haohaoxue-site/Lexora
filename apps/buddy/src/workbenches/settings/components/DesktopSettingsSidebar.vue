<script setup lang="ts">
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
import { useRoute } from 'vue-router'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { desktopRouteLocations } from '@/router'

const props = defineProps<{
  appSidebarCollapsed: boolean
  language: BuddyLocale
}>()
const emit = defineEmits<{
  toggleAppSidebar: []
}>()
const route = useRoute()
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
      <RouterLink
        v-for="category in categories"
        :key="category.key"
        :class="{ 'is-active': route.meta.settingsCategory === category.key }"
        :to="desktopRouteLocations.settings(category.key)"
      >
        <NIcon :component="category.icon" />
        <span>{{ t(`desktop.settings.category.${category.key}`) }}</span>
      </RouterLink>
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
  border-right: 1px solid var(--buddy-border-subtle);
  background: var(--buddy-surface-workspace-sidebar);
}

.desktop-settings-sidebar__header {
  display: flex;
  height: var(--buddy-region-header-height);
  flex: none;
  align-items: center;
  gap: 0.35rem;
  border-bottom: 1px solid var(--buddy-border-subtle);
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

.desktop-settings-sidebar__content > a {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.65rem;
  border: 0;
  border-radius: 0.45rem;
  background: transparent;
  color: var(--buddy-text-primary);
  font-size: var(--buddy-sidebar-item-font-size);
  font-weight: var(--buddy-sidebar-item-font-weight);
  line-height: 20px;
  padding: 0.55rem 0.65rem;
  text-align: left;
  text-decoration: none;
  transition:
    background-color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing),
    color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing);
}

.desktop-settings-sidebar__content > a:hover {
  background: var(--buddy-nav-hover);
}

.desktop-settings-sidebar__content > a:focus-visible {
  outline: 2px solid var(--buddy-focus-ring);
  outline-offset: -2px;
}

.desktop-settings-sidebar__content > a.is-active {
  background: var(--buddy-nav-selected);
  color: var(--buddy-nav-foreground);
  font-weight: var(--buddy-sidebar-item-active-font-weight);
}

.desktop-settings-sidebar__content > a.is-active:hover {
  background: var(--buddy-nav-pressed);
}
</style>
