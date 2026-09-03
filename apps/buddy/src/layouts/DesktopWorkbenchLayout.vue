<script setup lang="ts">
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { useTemplateRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { useDesktopWorkbenchResize } from './useDesktopWorkbenchResize'

const props = withDefaults(defineProps<{
  language: BuddyLocale
  sidebarResizable?: boolean
}>(), {
  sidebarResizable: false,
})
defineSlots<{
  context?: () => unknown
  default: () => unknown
  sidebar: () => unknown
}>()

const { t } = useBuddyI18n(() => props.language)
const container = useTemplateRef<HTMLElement>('container')
const context = useTemplateRef<HTMLElement>('context')
const sidebar = useTemplateRef<HTMLElement>('sidebar')
const {
  activePanel,
  beginResize,
  contextRange,
  contextWidth,
  handleResizeKeydown,
  layoutStyle,
  sidebarRange,
  sidebarWidth,
} = useDesktopWorkbenchResize({
  container,
  context,
  sidebar,
  sidebarResizable: () => props.sidebarResizable,
})
</script>

<template>
  <section
    ref="container"
    class="desktop-workbench-layout"
    :class="{ 'is-resizing': activePanel !== null }"
    :style="layoutStyle"
  >
    <div ref="sidebar" class="desktop-workbench-layout__sidebar">
      <slot name="sidebar" />
    </div>
    <div
      v-if="sidebarResizable"
      class="desktop-workbench-layout__resizer"
      :class="{ 'is-active': activePanel === 'sidebar' }"
      data-testid="workbench-sidebar-resizer"
      role="separator"
      :aria-label="t('desktop.layout.resizeTaskSidebar')"
      aria-orientation="vertical"
      :aria-valuemax="Math.round(sidebarRange.maximum)"
      :aria-valuemin="Math.round(sidebarRange.minimum)"
      :aria-valuenow="Math.round(sidebarWidth)"
      tabindex="0"
      @keydown="handleResizeKeydown('sidebar', $event)"
      @pointerdown="beginResize('sidebar', $event)"
    />
    <main class="desktop-workbench-layout__workspace">
      <slot />
    </main>
    <div
      v-if="$slots.context"
      class="desktop-workbench-layout__resizer"
      :class="{ 'is-active': activePanel === 'context' }"
      data-testid="workbench-context-resizer"
      role="separator"
      :aria-label="t('desktop.layout.resizeContext')"
      aria-orientation="vertical"
      :aria-valuemax="Math.round(contextRange.maximum)"
      :aria-valuemin="Math.round(contextRange.minimum)"
      :aria-valuenow="Math.round(contextWidth)"
      tabindex="0"
      @keydown="handleResizeKeydown('context', $event)"
      @pointerdown="beginResize('context', $event)"
    />
    <aside v-if="$slots.context" ref="context" class="desktop-workbench-layout__context">
      <slot name="context" />
    </aside>
    <div v-if="activePanel" class="desktop-workbench-layout__resize-shield" />
  </section>
</template>

<style scoped>
.desktop-workbench-layout {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1;
  background: var(--buddy-surface-base);
}

.desktop-workbench-layout__sidebar {
  display: flex;
  width: var(--buddy-workspace-sidebar-width);
  min-width: 0;
  min-height: 0;
  flex: none;
}

.desktop-workbench-layout__workspace {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
}

.desktop-workbench-layout__context {
  display: flex;
  width: var(--buddy-context-panel-width);
  min-width: 0;
  min-height: 0;
  flex: none;
  border-left: 1px solid var(--buddy-border-subtle);
}

.desktop-workbench-layout__resizer {
  position: relative;
  z-index: 11;
  width: 1px;
  height: 100%;
  flex: 0 0 1px;
  cursor: col-resize;
  margin-right: -1px;
  outline: 0;
  touch-action: none;
}

.desktop-workbench-layout__resizer::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -4px;
  width: 9px;
  content: '';
}

.desktop-workbench-layout__resizer::after {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 2px;
  background: transparent;
  content: '';
  transform: translateX(-0.5px);
  transition: background-color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing);
}

.desktop-workbench-layout__resizer:hover::after,
.desktop-workbench-layout__resizer:focus-visible::after,
.desktop-workbench-layout__resizer.is-active::after {
  background: var(--buddy-accent-solid);
}

.desktop-workbench-layout__resize-shield {
  position: absolute;
  z-index: 10;
  inset: 0;
  cursor: col-resize;
}

.desktop-workbench-layout.is-resizing,
.desktop-workbench-layout.is-resizing * {
  cursor: col-resize !important;
  user-select: none !important;
}
</style>
