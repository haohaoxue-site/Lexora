import type { Component } from 'vue'
import { ElLoadingDirective } from 'element-plus/es/components/loading/index.mjs'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { createApp } from 'vue'
import { i18n } from '@/i18n'
import { useUserStore } from '@/stores/user'
import 'element-plus/es/components/loading/style/css'

export default function setupCreateApp(component: Component) {
  const app = createApp(component)

  const pinia = createPinia()
  pinia.use(piniaPluginPersistedstate)
  app.use(pinia)
  app.use(i18n)
  app.directive('loading', ElLoadingDirective)
  app.runWithContext(() => {
    useUserStore()
  })

  return app
}
