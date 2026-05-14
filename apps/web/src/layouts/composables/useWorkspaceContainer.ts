import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { SvgIconCategory } from '@/components/svg-icon/typing'
import { ADMIN_ROUTE_PATH, isAdminRoutePath } from '@/router/constants'
import { adminNavigationItems, workspaceNavigationItems } from '@/router/routes'
import { useUiStore } from '@/stores/ui'

const workspaceBrand = {
  label: '同页',
  to: '/home',
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
    return isAdminContainer.value ? adminNavigationItems : workspaceNavigationItems
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
