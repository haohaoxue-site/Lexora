import { computed } from 'vue'
import { workspaceNavigationItems } from '@/router/routes'
import { useUiStore } from '@/stores/ui'

export function useWorkspaceShell() {
  const uiStore = useUiStore()
  const isSidebarCollapsed = computed(() => uiStore.workspaceSidebarCollapsed)

  function toggleSidebar() {
    uiStore.setWorkspaceSidebarCollapsed(!uiStore.workspaceSidebarCollapsed)
  }

  return {
    navigationItems: workspaceNavigationItems,
    isSidebarCollapsed,
    toggleSidebar,
  }
}
