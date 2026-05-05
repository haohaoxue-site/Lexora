<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useWorkspaceShell } from '@/layouts/composables/useWorkspaceShell'
import WorkspaceSidebarPanel from '@/layouts/panels/WorkspaceSidebarPanel.vue'

const {
  navigationItems,
  isSidebarCollapsed,
  toggleSidebar,
} = useWorkspaceShell()
</script>

<template>
  <div class="workspace-shell">
    <WorkspaceSidebarPanel
      :navigation-items="navigationItems"
      :is-collapsed="isSidebarCollapsed"
      @toggle="toggleSidebar"
    />

    <main class="workspace-shell__main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped lang="scss">
.workspace-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--brand-fill-light);
  color: var(--brand-text-primary);
  font-family: var(--el-font-family);

  .workspace-shell__main {
    flex: 1 1 0%;
    min-width: 0;
    overflow: hidden;
    border-left: 1px solid color-mix(in srgb, var(--brand-border-base) 60%, transparent);
    background: var(--brand-bg-surface);
    box-shadow: var(--brand-shadow-elevated);
  }
}
</style>
