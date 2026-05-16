import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { SvgIconCategory } from '@/components/svg-icon/typing'
import { ADMIN_ROUTE_PATH, isAdminRoutePath } from '@/router/constants'
import { adminNavigationItems, workspaceNavigationItems } from '@/router/routes'
import { useUiStore } from '@/stores/ui'

const workspaceBrand = {
  label: '同页',
  to: '/',
  iconCategory: SvgIconCategory.NAV,
  icon: 'workspace',
}

const adminBrand = {
  label: '同页',
  meta: '系统后台',
  to: ADMIN_ROUTE_PATH,
  iconCategory: SvgIconCategory.NAV,
  icon: 'workspace',
}

export function useWorkspaceContainer() {
  const route = useRoute()
  const uiStore = useUiStore()

  const isAdminContainer = computed(() => isAdminRoutePath(route.path))
  const isSidebarCollapsed = computed(() => uiStore.workspaceSidebarCollapsed)
  const brand = computed(() => isAdminContainer.value ? adminBrand : workspaceBrand)
  const navigationItems = computed(() => {
    if (isAdminContainer.value) {
      return adminNavigationItems
    }

    return workspaceNavigationItems.map(item => item.name === 'home'
      ? {
          ...item,
          to: uiStore.lastActiveChatSessionId
            ? {
                name: 'chat',
                params: {
                  sessionId: uiStore.lastActiveChatSessionId,
                },
              }
            : item.to,
        }
      : item)
  })

  function toggleSidebar() {
    uiStore.setWorkspaceSidebarCollapsed(!uiStore.workspaceSidebarCollapsed)
  }

  return {
    brand,
    navigationItems,
    isSidebarCollapsed,
    toggleSidebar,
  }
}
