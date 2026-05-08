import type { SettingsTabName } from '../typing'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const settingsRouteNameByTab = {
  'user': 'settings-user',
  'preference': 'settings-preference',
  'models-default': 'settings-models-default',
} as const satisfies Record<SettingsTabName, string>

export function useSettingsRouteTabs() {
  const route = useRoute()
  const router = useRouter()

  const activeTab = computed<SettingsTabName>({
    get() {
      if (route.name === settingsRouteNameByTab.preference) {
        return 'preference'
      }

      if (route.name === settingsRouteNameByTab['models-default']) {
        return 'models-default'
      }

      return 'user'
    },
    set(tabName) {
      void router.push({
        name: settingsRouteNameByTab[tabName],
      })
    },
  })

  return {
    activeTab,
  }
}
