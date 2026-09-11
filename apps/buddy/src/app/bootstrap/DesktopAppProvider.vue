<script setup lang="ts">
import type { DesktopBrowserGuestSurfaceHost } from '@/platform/browser/browserGuestSurface'
import { useMessage } from 'naive-ui'
import { onScopeDispose, provide, useTemplateRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { resolveBuddyLocale, translateBuddy } from '@/i18n/buddyI18n'
import { automationContextKey } from '@/modules/automations'
import { settingsContextKey } from '@/modules/settings'
import { taskContextKey, useTaskCapability } from '@/modules/tasks'
import DesktopBrowserGuestHost from '@/platform/browser/DesktopBrowserGuestHost.vue'
import { useBrowserGuestHost } from '@/platform/browser/useBrowserGuestHost'
import { requireDesktopApi } from '@/platform/desktop/desktopApi'
import { runtimeAvailabilityKey } from '@/platform/runtime/runtimeAvailability'
import { desktopAppContextKey } from '../desktopAppContext'
import { useDesktopShellState } from '../shell/useDesktopShellState'
import { createDesktopCapabilities } from './desktopCapabilities'
import { useDesktopAppState } from './useDesktopAppState'
import { useDesktopLifecycle } from './useDesktopLifecycle'
import { useDesktopNavigation } from './useDesktopNavigation'

const emit = defineEmits<{
  languageChange: [language: 'zh-CN' | 'en-US']
  themeChange: [theme: 'system' | 'light' | 'dark']
}>()
defineSlots<{ default: () => unknown }>()

const api = requireDesktopApi()
const router = useRouter()
const message = useMessage()
const appState = useDesktopAppState({ api })
const { stores } = appState
const tasks = useTaskCapability({
  api,
  applicationSettings: stores.applicationSettings,
  localCapabilities: stores.localCapabilities,
  modelProviders: stores.modelProviders,
  runtimeSupervisor: stores.runtimeSupervisor,
})
const capabilities = createDesktopCapabilities({ api, stores, tasks, onAutomationRunFailure: error => message.error(error) })
const shell = useDesktopShellState(stores.applicationSettings, api)
const lifecycle = useDesktopLifecycle({
  api,
  appState,
  automations: capabilities.automations,
  shell,
  tasks,
  prepareSurface: () => router.isReady(),
})
const { ready } = lifecycle
provide(runtimeAvailabilityKey, { loading: lifecycle.loading, failed: lifecycle.failed, language: stores.applicationSettings.language, retry: lifecycle.retry })
const navigation = useDesktopNavigation({
  router,
  ready,
  session: tasks.session,
  notifications: stores.notifications,
  getRun: api.localChat.runs.get,
  onError: () => message.error(translateBuddy(stores.applicationSettings.language.value, 'desktop.command.failed')),
})
const { notificationTargetMessageId } = navigation
onScopeDispose(api.app.onOpenTarget(navigation.openTarget))
const browserGuestHost = useTemplateRef<DesktopBrowserGuestSurfaceHost>('browserGuestHost')
const browserGuests = useBrowserGuestHost(browserGuestHost)
const toggleAppSidebar = () => void shell.setAppSidebarCollapsed(!shell.appSidebarCollapsed.value)

provide(desktopAppContextKey, {
  lifecycle,
  appInfo: shell.appInfo,
  appSidebarCollapsed: shell.appSidebarCollapsed,
  language: stores.applicationSettings.language,
  navigation,
  notifications: stores.notifications,
  taskIndex: tasks.index,
  toggleAppSidebar,
})
provide(taskContextKey, {
  appSidebarCollapsed: shell.appSidebarCollapsed,
  browser: api.browser,
  browserGuests,
  clipboard: api.clipboard,
  notificationTargetMessageId,
  tasks,
})
provide(settingsContextKey, {
  applicationSettings: stores.applicationSettings,
  appInfo: shell.appInfo,
  appSidebarCollapsed: shell.appSidebarCollapsed,
  dataSettings: capabilities.dataSettings,
  localSettings: capabilities.localSettings,
  platformCapabilities: shell.platformCapabilities,
  providerSettings: stores.modelProviders,
  ready,
  webSettings: capabilities.webSettings,
  openTask: navigation.openTask,
})
provide(automationContextKey, {
  automations: capabilities.automations,
  language: stores.applicationSettings.language,
  openTask: async (id) => { await tasks.session.openTask(id) },
  providerSettings: stores.modelProviders,
  ready,
  refreshTasks: async () => { await tasks.index.refresh() },
  spaces: tasks.index.spaces,
})

watch(() => stores.applicationSettings.config.value?.desktop.language, (language) => {
  if (language)
    emit('languageChange', resolveBuddyLocale(language))
}, { immediate: true })
watch(() => stores.applicationSettings.config.value?.desktop.theme, (theme) => {
  if (theme)
    emit('themeChange', theme)
}, { immediate: true })
</script>

<template>
  <DesktopBrowserGuestHost ref="browserGuestHost" :api="api.browser" />
  <slot />
</template>
