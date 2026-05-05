import type { Component } from 'vue'
import { provideGlobalConfig } from 'element-plus/es/components/config-provider/index.mjs'
import { ElLoadingDirective } from 'element-plus/es/components/loading/index.mjs'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { createApp } from 'vue'
import { useUserStore } from '@/stores/user'

export default function setupCreateApp(component: Component) {
  const app = createApp(component)

  const pinia = createPinia()
  pinia.use(piniaPluginPersistedstate)
  app.use(pinia)
  app.directive('loading', ElLoadingDirective)
  provideGlobalConfig({ locale: zhCn }, app, true)
  app.runWithContext(() => {
    useUserStore()
  })

  return app
}
