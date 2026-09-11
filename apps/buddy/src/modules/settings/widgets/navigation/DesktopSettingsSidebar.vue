<script setup lang="ts">
import type { BuddyCapabilities } from '@buddy-shared/platform'

import type { BuddyLocale } from '@/i18n/buddyI18n'
import {
  AnimalCat20Regular,
  Apps20Regular,
  Bot20Regular,
  DataHistogram20Regular,
  Globe20Regular,
  TextBulletListLtr20Regular,
} from '@vicons/fluent'
import { computed } from 'vue'

import { useRoute } from 'vue-router'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { supportsSettingsCategory } from '@/platform/desktop/desktopCapabilities'
import { desktopRouteLocations } from '@/shared/navigation/desktopRoutes'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import DesktopWorkspaceSidebarIdentity from '@/shared/ui/workspace-sidebar/DesktopWorkspaceSidebarIdentity.vue'

const props = defineProps<{
  appSidebarCollapsed: boolean
  language: BuddyLocale
  capabilities: BuddyCapabilities | null
}>()
const route = useRoute()
const { t } = useBuddyI18n(() => props.language)
const categories = [
  { icon: Apps20Regular, key: 'app' as const },
  { icon: Bot20Regular, key: 'models' as const },
  { icon: Globe20Regular, key: 'web' as const },
  { icon: AnimalCat20Regular, key: 'pet' as const },
  { icon: DataHistogram20Regular, key: 'usage' as const },
  { icon: TextBulletListLtr20Regular, key: 'logs' as const },
]
const visibleCategories = computed(() => categories.filter(category => supportsSettingsCategory(props.capabilities, category.key)))
</script>

<template>
  <nav class="desktop-settings-sidebar">
    <header class="desktop-settings-sidebar__header">
      <DesktopWorkspaceSidebarIdentity
        :label="t('desktop.navigation.settings')"
        :visible="appSidebarCollapsed"
      />
    </header>

    <div class="desktop-settings-sidebar__content">
      <RouterLink
        v-for="category in visibleCategories"
        :key="category.key"
        :class="{ 'is-active': route.meta.settingsCategory === category.key }"
        :to="desktopRouteLocations.settings(category.key)"
      >
        <DesktopIcon :component="category.icon" />
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
