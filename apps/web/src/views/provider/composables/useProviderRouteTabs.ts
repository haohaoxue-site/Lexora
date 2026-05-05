import type { ProviderTabName } from '../typing'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const providerRouteNameByTab = {
  models: 'provider-models',
  usage: 'provider-usage',
} as const satisfies Record<ProviderTabName, string>

export function useProviderRouteTabs() {
  const route = useRoute()
  const router = useRouter()

  const activeTab = computed<ProviderTabName>({
    get() {
      return route.name === providerRouteNameByTab.usage ? 'usage' : 'models'
    },
    set(tabName) {
      void router.push({
        name: providerRouteNameByTab[tabName],
      })
    },
  })

  return {
    activeTab,
  }
}
