<script setup lang="ts">
import type { TaskContextTab } from './taskContextPanel'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import {
  Dismiss16Regular,
  PanelRight20Regular,
} from '@vicons/fluent'
import { NEmpty, NIcon } from 'naive-ui'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopArtifactContextSurface from './DesktopArtifactContextSurface.vue'
import DesktopArtifactFileIcon from './DesktopArtifactFileIcon.vue'

const props = defineProps<{
  activeTab: TaskContextTab | null
  language: BuddyLocale
  tabs: ReadonlyArray<TaskContextTab>
}>()
const emit = defineEmits<{
  closeTab: [tabId: string]
  collapse: []
  selectTab: [tabId: string]
}>()

const { t } = useBuddyI18n(() => props.language)
const tabCountLabel = computed(() => t('desktop.context.tabCount', { count: props.tabs.length }))
</script>

<template>
  <section class="desktop-task-context-panel" data-testid="task-context-panel">
    <header class="desktop-task-context-panel__header">
      <div
        class="desktop-task-context-panel__tabs"
        role="tablist"
        :aria-label="tabCountLabel"
      >
        <div
          v-for="tab in tabs"
          :key="tab.id"
          class="desktop-task-context-panel__tab"
          :class="{ 'is-active': tab.id === activeTab?.id }"
        >
          <button
            class="desktop-task-context-panel__tab-select"
            role="tab"
            type="button"
            :aria-selected="tab.id === activeTab?.id"
            @click="emit('selectTab', tab.id)"
          >
            <DesktopArtifactFileIcon
              v-if="tab.kind === 'artifact'"
              :mime-type="tab.artifact.mimeType"
              :name="tab.artifact.name"
            />
            <span>{{ tab.label }}</span>
          </button>
          <button
            class="desktop-task-context-panel__tab-close"
            type="button"
            :aria-label="t('desktop.context.closeTab', { name: tab.label })"
            @click="emit('closeTab', tab.id)"
          >
            <NIcon :component="Dismiss16Regular" />
          </button>
        </div>
      </div>
      <button
        class="desktop-task-context-panel__collapse"
        data-testid="task-context-collapse"
        type="button"
        :aria-label="t('desktop.context.collapse')"
        @click="emit('collapse')"
      >
        <NIcon :component="PanelRight20Regular" />
      </button>
    </header>

    <DesktopArtifactContextSurface
      v-if="activeTab?.kind === 'artifact'"
      :artifact="activeTab.artifact"
      :language="language"
    />
    <div v-else class="desktop-task-context-panel__empty">
      <NEmpty :description="t('desktop.context.empty')" />
    </div>
  </section>
</template>

<style scoped>
.desktop-task-context-panel {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex: none;
  flex-direction: column;
  background: var(--buddy-surface-base);
}

.desktop-task-context-panel__header {
  display: flex;
  height: var(--buddy-region-header-height);
  min-width: 0;
  flex: none;
  align-items: stretch;
  border-bottom: 1px solid var(--buddy-border-subtle);
  background: var(--buddy-surface-base);
}

.desktop-task-context-panel__tabs {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: stretch;
  gap: 0.25rem;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0.5625rem 0.25rem;
  scrollbar-width: thin;
}

.desktop-task-context-panel__tab {
  position: relative;
  display: flex;
  height: 2.5rem;
  min-width: 7.5rem;
  max-width: 14rem;
  flex: 0 1 11rem;
  align-items: center;
  overflow: hidden;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  color: var(--buddy-text-secondary);
  transition:
    background-color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing),
    color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing);
}

.desktop-task-context-panel__tab:hover {
  background: var(--buddy-nav-hover);
  color: var(--buddy-text-strong);
}

.desktop-task-context-panel__tab.is-active {
  background: var(--buddy-nav-hover);
  color: var(--buddy-nav-foreground);
}

.desktop-task-context-panel__tab:active,
.desktop-task-context-panel__tab.is-active:hover {
  background: var(--buddy-nav-selected);
}

.desktop-task-context-panel__tab.is-active:active {
  background: var(--buddy-nav-pressed);
}

.desktop-task-context-panel__tab-select {
  display: flex;
  min-width: 0;
  height: 100%;
  flex: 1;
  align-items: center;
  gap: 0.375rem;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 0 0.2rem 0 0.625rem;
  text-align: left;
}

.desktop-task-context-panel__tab-select span {
  overflow: hidden;
  font-size: 0.76rem;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-task-context-panel__tab.is-active .desktop-task-context-panel__tab-select span {
  font-weight: 600;
}

.desktop-task-context-panel__tab-select:focus-visible,
.desktop-task-context-panel__tab-close:focus-visible,
.desktop-task-context-panel__collapse:focus-visible {
  outline: 2px solid var(--buddy-focus-ring);
  outline-offset: -2px;
}

.desktop-task-context-panel__tab-close,
.desktop-task-context-panel__collapse {
  display: grid;
  flex: none;
  place-items: center;
  border: 0;
  border-radius: var(--buddy-icon-button-radius);
  background: transparent;
  color: var(--buddy-text-secondary);
  cursor: pointer;
}

.desktop-task-context-panel__tab-close {
  width: 1.5rem;
  height: 1.5rem;
  margin-right: 0.25rem;
}

.desktop-task-context-panel__collapse {
  width: 2rem;
  height: 2rem;
  align-self: center;
  margin: 0 0.375rem;
}

.desktop-task-context-panel__collapse :deep(.n-icon) {
  width: 1.25rem;
  height: 1.25rem;
  font-size: 1.25rem;
}

.desktop-task-context-panel__tab-close :deep(.n-icon) {
  width: 0.875rem;
  height: 0.875rem;
  font-size: 0.875rem;
}

.desktop-task-context-panel__tab-close:hover,
.desktop-task-context-panel__collapse:hover {
  background: var(--buddy-state-hover);
  color: var(--buddy-text-strong);
}

.desktop-task-context-panel__empty {
  display: grid;
  min-width: 0;
  min-height: 0;
  flex: 1;
  place-items: center;
}
</style>
