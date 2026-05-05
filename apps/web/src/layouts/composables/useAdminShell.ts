import type { AdminNavigationItem } from '@/router/typing'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { adminNavigationItems, DEFAULT_ADMIN_NAVIGATION_ITEM } from '@/router/navigation'

export function useAdminShell() {
  const route = useRoute()
  const currentNavigationItem = computed<AdminNavigationItem>(() =>
    adminNavigationItems.find(item => item.routeName === route.name) ?? DEFAULT_ADMIN_NAVIGATION_ITEM,
  )

  return {
    navigationItems: adminNavigationItems,
    currentNavigationItem,
  }
}
