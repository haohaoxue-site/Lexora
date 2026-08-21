<script setup lang="ts">
import type { DesktopOpenTarget, LexoraDesktopApi } from '../../electron/shared/desktopApi'
import type { LocalNotification } from '../../electron/shared/localChatApi'
import type { DesktopRoute, DesktopSettingsCategory } from './desktopViewState'
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import DesktopAppSidebar from './DesktopAppSidebar.vue'
import DesktopChatPage from './DesktopChatPage.vue'
import DesktopChatSidebar from './DesktopChatSidebar.vue'
import DesktopChatWorkspaceHeader from './DesktopChatWorkspaceHeader.vue'
import DesktopSettingsPage from './DesktopSettingsPage.vue'
import DesktopSettingsSidebar from './DesktopSettingsSidebar.vue'
import DesktopTitleBar from './DesktopTitleBar.vue'
import { resolveDesktopRoute, toDesktopRouteHash } from './desktopViewState'
import { useDesktopChat } from './useDesktopChat'
import { useDesktopConversationSearch } from './useDesktopConversationSearch'
import { useDesktopShellState } from './useDesktopShellState'

const emit = defineEmits<{
  themeChange: [theme: 'system' | 'light' | 'dark']
}>()
const chat = useDesktopChat()
const shell = useDesktopShellState()
const activeRoute = shallowRef<DesktopRoute>(resolveDesktopRoute(window.location))
const notificationTargetMessageId = shallowRef<string | null>(null)
let initializePromise: Promise<void> | null = null
let notificationTargetTimer: ReturnType<typeof setTimeout> | null = null
const desktopApi = requireDesktopApi()
const stopOpenTarget = desktopApi.app.onOpenTarget(openDesktopTarget)
const conversationSearch = useDesktopConversationSearch({
  activeBranchId: chat.activeBranchId,
  activeConversationId: chat.activeConversationId,
  loadMessages: chat.listActiveConversationMessages,
})

watch(
  () => chat.config.value?.desktop.theme,
  (theme) => {
    if (theme)
      emit('themeChange', theme)
  },
  { immediate: true },
)

function navigateSettings(category: DesktopSettingsCategory = 'app') {
  navigateRoute({ category, view: 'settings' })
}

function navigateChat() {
  navigateRoute({ view: 'chat' })
}

function navigateRoute(route: DesktopRoute) {
  activeRoute.value = route
  const hash = toDesktopRouteHash(route)
  if (window.location.hash !== hash) {
    window.location.hash = hash
    return
  }
  activateRoute(route)
}

function syncViewFromLocation() {
  activeRoute.value = resolveDesktopRoute(window.location)
  activateRoute(activeRoute.value)
}

function activateRoute(route: DesktopRoute) {
  void (initializePromise ?? Promise.resolve()).then(async () => {
    if (route.view !== 'settings')
      return
    if (route.category === 'models')
      await chat.loadAgent()
    if (route.category === 'local')
      await Promise.all([chat.loadSkills(chat.projectId.value), chat.loadConnectors()])
    if (route.category === 'data')
      await Promise.all([chat.loadUsage(), chat.loadRuntimeDataBackups()])
  })
}

function toggleAppSidebar() {
  void shell.setAppSidebarCollapsed(!shell.appSidebarCollapsed.value)
}

function openGlobalSearchConversation(conversationId: string) {
  navigateChat()
  void chat.openConversation(conversationId)
}

function openGlobalSearchProject(projectId: string) {
  navigateChat()
  void chat.startProjectConversation(projectId)
}

async function openDesktopTarget(target: DesktopOpenTarget) {
  await focusRun(target.conversationId, target.runId)
}

async function openNotification(notification: LocalNotification) {
  await chat.markNotificationSeen(notification)
  navigateSettings('models')
}

async function focusRun(conversationId: string, runId: string) {
  navigateChat()
  await (initializePromise ?? Promise.resolve())
  await chat.openConversation(conversationId)
  const run = await desktopApi.localChat.runs.get(runId).catch(() => null)
  if (run?.conversationId !== conversationId)
    return
  notificationTargetMessageId.value = run.triggeringMessageId
  if (notificationTargetTimer)
    clearTimeout(notificationTargetTimer)
  notificationTargetTimer = setTimeout(() => {
    notificationTargetTimer = null
    notificationTargetMessageId.value = null
  }, 3_000)
}

onMounted(() => {
  window.addEventListener('hashchange', syncViewFromLocation)
  initializePromise = Promise.all([chat.initialize(), shell.initialize()]).then(() => undefined)
  void initializePromise.then(() => activateRoute(activeRoute.value))
})

onBeforeUnmount(() => {
  stopOpenTarget()
  if (notificationTargetTimer)
    clearTimeout(notificationTargetTimer)
  window.removeEventListener('hashchange', syncViewFromLocation)
})

function requireDesktopApi(): LexoraDesktopApi {
  const api = window.lexoraDesktop
  if (!api)
    throw new Error('Lexora Desktop bridge is unavailable')
  return api
}
</script>

<template>
  <div class="desktop-shell">
    <DesktopTitleBar
      :app-info="shell.appInfo.value"
      :language="chat.language.value"
    />
    <div class="desktop-shell__body">
      <Transition name="desktop-app-sidebar">
        <DesktopAppSidebar
          v-if="!shell.appSidebarCollapsed.value"
          :app-version="shell.appInfo.value?.version ?? null"
          :conversations="chat.conversations.value"
          :language="chat.language.value"
          :mode="activeRoute.view"
          :notification-items="chat.notificationItems.value"
          :notification-loading="chat.notificationLoading.value"
          :notification-unseen-count="chat.notificationUnseenCount.value"
          :projects="chat.projects.value"
          @navigate-chat="navigateChat"
          @navigate-settings="navigateSettings('app')"
          @mark-all-notifications-seen="chat.markAllNotificationsSeen"
          @open-notification="openNotification"
          @open-conversation="openGlobalSearchConversation"
          @open-project="openGlobalSearchProject"
          @toggle-sidebar="toggleAppSidebar"
          @refresh-notifications="chat.loadNotifications"
        />
      </Transition>

      <div class="desktop-shell__workbench">
        <DesktopChatSidebar
          v-if="activeRoute.view === 'chat'"
          :active-conversation-id="chat.activeConversationId.value"
          :app-sidebar-collapsed="shell.appSidebarCollapsed.value"
          :conversations="chat.conversations.value"
          :language="chat.language.value"
          :projects="chat.projects.value"
          :section-order="shell.chatSidebarSectionOrder.value"
          @create-project="chat.createProject"
          @delete-conversation="chat.deleteConversation"
          @delete-project="chat.deleteProject"
          @new-global="chat.startGlobalConversation"
          @new-project="chat.startProjectConversation"
          @open-conversation="chat.openConversation"
          @rename-conversation="chat.renameConversation"
          @reorder-sections="shell.setChatSidebarSectionOrder"
          @toggle-app-sidebar="toggleAppSidebar"
          @update-project="chat.updateProject"
        />
        <DesktopSettingsSidebar
          v-else
          :active-category="activeRoute.category"
          :app-sidebar-collapsed="shell.appSidebarCollapsed.value"
          :language="chat.language.value"
          @navigate="navigateSettings"
          @toggle-app-sidebar="toggleAppSidebar"
        />

        <main class="desktop-shell__workspace">
          <template v-if="activeRoute.view === 'chat'">
            <DesktopChatWorkspaceHeader
              :active-search-index="conversationSearch.activeIndex.value"
              :can-search-conversation="chat.activeConversationId.value !== null"
              :conversation-search-loading="conversationSearch.isLoading.value"
              :conversation-search-open="conversationSearch.isOpen.value"
              :conversation-search-query="conversationSearch.query.value"
              :conversation-search-result-count="conversationSearch.resultCount.value"
              :language="chat.language.value"
              :project-name="chat.activeProject.value?.name ?? null"
              :title="chat.currentTitle.value"
              @close-conversation-search="conversationSearch.close"
              @next-conversation-search-result="conversationSearch.move(1)"
              @open-conversation-search="conversationSearch.open"
              @previous-conversation-search-result="conversationSearch.move(-1)"
              @update-conversation-search="conversationSearch.setQuery"
            />
            <DesktopChatPage
              :active-search-message-id="notificationTargetMessageId ?? conversationSearch.activeMessageId.value"
              :chat="chat"
              :matching-search-message-ids="conversationSearch.matchingMessageIds.value"
              @open-settings="navigateSettings"
            />
          </template>
          <DesktopSettingsPage
            v-else
            :active-category="activeRoute.category"
            :app-info="shell.appInfo.value"
            :chat="chat"
          />
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
.desktop-shell {
  display: flex;
  width: 100dvw;
  height: 100dvh;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  background: var(--buddy-bg-body);
}

.desktop-shell__body,
.desktop-shell__workbench {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
}

.desktop-shell__workbench {
  background: var(--buddy-bg-surface);
}

.desktop-shell__workspace {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.desktop-shell__workspace > .desktop-chat-page {
  min-height: 0;
  flex: 1;
}

.desktop-shell__workspace > .desktop-settings-page {
  width: 100%;
  height: 100%;
}

.desktop-app-sidebar-enter-active,
.desktop-app-sidebar-leave-active {
  transition:
    width 140ms cubic-bezier(0.4, 0, 0.2, 1),
    opacity 100ms ease;
  will-change: width, opacity;
}

.desktop-app-sidebar-enter-from,
.desktop-app-sidebar-leave-to {
  width: 0;
  border-right-color: transparent;
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .desktop-app-sidebar-enter-active,
  .desktop-app-sidebar-leave-active {
    transition: none;
  }
}
</style>
