<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useWorkspaceContainer } from '@/layouts/composables/useWorkspaceContainer'
import SidebarPanel from '@/layouts/panels/SidebarPanel.vue'

const {
  brand,
  navigationItems,
  isSidebarCollapsed,
  showSidebarToggle,
  toggleSidebar,
} = useWorkspaceContainer()
</script>

<template>
  <div class="workspace-container">
    <SidebarPanel
      :brand="brand"
      :items="navigationItems"
      :is-collapsed="isSidebarCollapsed"
      :show-toggle="showSidebarToggle"
      @toggle="toggleSidebar"
    />

    <main class="workspace-container__main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped lang="scss">
.workspace-container {
  display: flex;
  height: var(--app-shell-height);
  overflow: hidden;
  background: var(--brand-fill-light);
  color: var(--brand-text-primary);
  font-family: var(--el-font-family);

  .workspace-container__main {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border-left: 1px solid color-mix(in srgb, var(--brand-border-base) 60%, transparent);
    background: var(--brand-bg-surface);
    box-shadow: var(--brand-shadow-elevated);
  }
}
</style>
