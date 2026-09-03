<script setup lang="ts">
import type { LocalArtifactText, LocalChangeSetDetail } from '@buddy-electron/shared/localChatApi'
import type { TaskContextTab } from './taskContextPanel'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import {
  Code16Regular,
  Dismiss16Regular,
  Globe16Regular,
  PanelRight20Regular,
} from '@vicons/fluent'
import { NButton, NEmpty, NIcon, NScrollbar } from 'naive-ui'
import { computed, shallowRef, useTemplateRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import BuddyFileIcon from '@/ui/files/BuddyFileIcon.vue'
import DesktopArtifactContextSurface from './DesktopArtifactContextSurface.vue'
import DesktopBrowserContextSurface from './DesktopBrowserContextSurface.vue'
import DesktopChangeContextSurface from './DesktopChangeContextSurface.vue'
import { changeTabId } from './taskContextPanel'

const props = defineProps<{
  activeTab: TaskContextTab | null
  getChangeSet: (changeSetId: string) => Promise<LocalChangeSetDetail>
  language: BuddyLocale
  readArtifactText: (artifactId: string) => Promise<LocalArtifactText>
  tabs: ReadonlyArray<TaskContextTab>
}>()
const emit = defineEmits<{
  closeTab: [tabId: string]
  collapse: []
  openBrowser: []
  selectTab: [tabId: string]
}>()

const { t } = useBuddyI18n(() => props.language)
const tabsScrollRoot = useTemplateRef<HTMLElement>('tabsScrollRoot')
const tabCountLabel = computed(() => t('desktop.context.tabCount', { count: props.tabs.length }))
const changeFileLabels = shallowRef<Readonly<Record<string, string>>>({})

function tabLabel(tab: TaskContextTab): string {
  if (tab.kind === 'changes')
    return changeFileLabels.value[tab.id] ?? t('desktop.context.changes')
  if (tab.kind === 'browser')
    return t('desktop.context.browser')
  return tab.label
}

function updateChangeFileLabel(payload: { changeSetId: string, fileName: string | null }): void {
  const tabId = changeTabId(payload.changeSetId)
  const labels = { ...changeFileLabels.value }
  if (payload.fileName)
    labels[tabId] = payload.fileName
  else
    delete labels[tabId]
  changeFileLabels.value = labels
}

function handleTabsWheel(event: WheelEvent) {
  if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY))
    return
  event.preventDefault()
  const scrollport = findTabsScrollport()
  if (!scrollport)
    return
  const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? scrollport.clientWidth
      : 1
  scrollport.scrollLeft = Math.min(
    Math.max(0, scrollport.scrollLeft + event.deltaY * multiplier),
    scrollport.scrollWidth - scrollport.clientWidth,
  )
}

function findTabsScrollport(): HTMLElement | null {
  return [...tabsScrollRoot.value?.querySelectorAll<HTMLElement>('*') ?? []]
    .find((element) => {
      const overflowX = getComputedStyle(element).overflowX
      return element.scrollWidth > element.clientWidth + 1
        && (overflowX === 'auto' || overflowX === 'scroll')
    }) ?? null
}
</script>

<template>
  <section class="desktop-task-context-panel" data-testid="task-context-panel">
    <header class="desktop-task-context-panel__header">
      <div
        ref="tabsScrollRoot"
        class="desktop-task-context-panel__tabs-scroll"
        @wheel="handleTabsWheel"
      >
        <NScrollbar
          class="desktop-task-context-panel__tabs-scrollbar"
          trigger="hover"
          x-scrollable
        >
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
                <BuddyFileIcon
                  v-if="tab.kind === 'artifact'"
                  :name="tab.artifact.name"
                />
                <NIcon
                  v-else
                  :component="tab.kind === 'browser' ? Globe16Regular : Code16Regular"
                />
                <span>{{ tabLabel(tab) }}</span>
              </button>
              <button
                class="desktop-task-context-panel__tab-close"
                type="button"
                :aria-label="t('desktop.context.closeTab', { name: tabLabel(tab) })"
                @click="emit('closeTab', tab.id)"
              >
                <NIcon :component="Dismiss16Regular" />
              </button>
            </div>
          </div>
        </NScrollbar>
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
      :read-artifact-text="readArtifactText"
    />
    <DesktopChangeContextSurface
      v-else-if="activeTab?.kind === 'changes'"
      :change-set="activeTab.changeSet"
      :get-change-set="getChangeSet"
      :language="language"
      @active-file-change="updateChangeFileLabel"
    />
    <DesktopBrowserContextSurface
      v-else-if="activeTab?.kind === 'browser'"
      :key="activeTab.id"
      :conversation-id="activeTab.conversationId"
      :language="language"
    />
    <div v-else class="desktop-task-context-panel__empty">
      <NEmpty :description="t('desktop.context.empty')">
        <template #extra>
          <NButton data-testid="task-context-open-browser" @click="emit('openBrowser')">
            <template #icon>
              <NIcon :component="Globe16Regular" />
            </template>
            {{ t('desktop.context.openBrowser') }}
          </NButton>
        </template>
      </NEmpty>
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

.desktop-task-context-panel__tabs-scroll {
  min-width: 0;
  flex: 1;
  overflow: hidden;
}

:deep(.desktop-task-context-panel__tabs-scrollbar) {
  width: 100%;
  height: 100%;
}

.desktop-task-context-panel__tabs {
  display: flex;
  width: max-content;
  height: 100%;
  align-items: stretch;
  gap: 0.25rem;
  padding: 0.5625rem 0.25rem;
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
