import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { adminNavigationItems } from '@/router/routes'

export function useAdminShell() {
  const route = useRoute()
  const currentNavigationLabel = computed(() => route.meta.navLabel)

  return {
    navigationItems: adminNavigationItems,
    currentNavigationLabel,
  }
}
