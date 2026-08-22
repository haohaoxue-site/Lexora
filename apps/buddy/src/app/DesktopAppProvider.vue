<script setup lang="ts">
import type { DesktopOpenTarget, LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import { useTimeoutFn } from '@vueuse/core'
import { onBeforeUnmount, provide, readonly, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { desktopAppContextKey } from '@/app/desktopAppContext'
import { createDesktopCapabilities } from '@/app/desktopCapabilities'
import { useDesktopAppState } from '@/app/useDesktopAppState'
import { desktopRouteLocations } from '@/router'
import { useDesktopShellState } from '@/shell/useDesktopShellState'
import { useChatCapability } from '@/workbenches/chat/state/useChatCapability'

const emit = defineEmits<{
  themeChange: [theme: 'system' | 'light' | 'dark']
}>()

defineSlots<{
  default: () => unknown
}>()

const router = useRouter()
const api = requireDesktopApi()
const appState = useDesktopAppState({ api })
const { stores } = appState
const chat = useChatCapability({
  api,
  applicationSettings: stores.applicationSettings,
  localCapabilities: stores.localCapabilities,
  modelProviders: stores.modelProviders,
  runtimeRecovery: stores.runtimeRecovery,
  runtimeSupervisor: stores.runtimeSupervisor,
})
const capabilities = createDesktopCapabilities({
  api,
  chat,
  stores,
})
const shell = useDesktopShellState(capabilities.applicationSettings)
const notificationTargetMessageId = shallowRef<string | null>(null)
const notificationTargetTimer = useTimeoutFn(
  () => notificationTargetMessageId.value = null,
  3_000,
  { immediate: false },
)
let isApplicationReady = false
const stopRuntimeReadyWatch = watch(
  stores.runtimeSupervisor.runtimeState,
  (state, previousState) => {
    if (
      isApplicationReady
      && previousState.status !== 'ready'
      && state.status === 'ready'
    ) {
      void chat.refreshRuntimeDependentState()
    }
  },
)
const ready = initialize()
const stopOpenTargetListener = api.app.onOpenTarget(openDesktopTarget)

watch(
  () => capabilities.applicationSettings.config.value?.desktop.theme,
  (theme) => {
    if (theme)
      emit('themeChange', theme)
  },
  { immediate: true },
)

provide(desktopAppContextKey, {
  capabilities,
  notificationTargetMessageId: readonly(notificationTargetMessageId),
  ready,
  shell,
  toggleAppSidebar,
})

function toggleAppSidebar() {
  void shell.setAppSidebarCollapsed(!shell.appSidebarCollapsed.value)
}

async function initialize() {
  await appState.initialize()
  await Promise.all([
    chat.initialize(),
    shell.initialize(),
  ])
  isApplicationReady = true
}

async function openDesktopTarget(target: DesktopOpenTarget) {
  await router.push(desktopRouteLocations.chat())
  await ready
  await chat.session.openConversation(target.conversationId)
  const run = await api.localChat.runs.get(target.runId).catch(() => null)
  if (run?.conversationId !== target.conversationId)
    return
  notificationTargetMessageId.value = run.triggeringMessageId
  notificationTargetTimer.stop()
  notificationTargetTimer.start()
}

onBeforeUnmount(() => {
  chat.dispose()
  appState.dispose()
  stopOpenTargetListener()
  stopRuntimeReadyWatch()
})

function requireDesktopApi(): LexoraDesktopApi {
  const api = window.lexoraDesktop
  if (!api)
    throw new Error('Lexora Buddy Desktop bridge is unavailable')
  return api
}
</script>

<template>
  <slot />
</template>
