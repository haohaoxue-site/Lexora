<script setup lang="ts">
import type { LocalNotification } from '@buddy-electron/shared/localChatApi'
import { computed } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { useDesktopApp } from '@/app/desktopAppContext'
import { desktopRouteLocations } from '@/router'
import DesktopAppSidebar from '@/shell/DesktopAppSidebar.vue'
import DesktopTitleBar from '@/window/DesktopTitleBar.vue'

const route = useRoute()
const router = useRouter()
const { capabilities, shell, toggleAppSidebar } = useDesktopApp()
const { notifications, tasks } = capabilities
const { index: taskIndex, session: taskSession } = tasks
const activeView = computed(() => route.meta.desktopView ?? 'tasks')

async function openGlobalSearchTask(conversationId: string) {
  await router.push(desktopRouteLocations.tasks())
  await taskSession.openTask(conversationId)
}

async function openGlobalSearchProject(projectId: string) {
  await router.push(desktopRouteLocations.tasks())
  await taskSession.startTask(projectId)
}

async function openNotification(notification: LocalNotification) {
  await notifications.markSeen(notification)
  if (notification.action.type === 'open-model-settings') {
    await router.push(desktopRouteLocations.settings('models'))
    return
  }
  await router.push(desktopRouteLocations.tasks())
  await taskSession.openTask(notification.action.conversationId)
}
</script>

<template>
  <div class="desktop-shell">
    <DesktopTitleBar
      :app-info="shell.appInfo.value"
      :language="tasks.language.value"
    />
    <div class="desktop-shell__body">
      <Transition name="desktop-app-sidebar">
        <DesktopAppSidebar
          v-if="!shell.appSidebarCollapsed.value"
          :app-version="shell.appInfo.value?.version ?? null"
          :conversations="taskIndex.tasks.value"
          :language="tasks.language.value"
          :mode="activeView"
          :notification-items="notifications.items.value"
          :notification-loading="notifications.isLoading.value"
          :notification-unseen-count="notifications.unseenCount.value"
          :projects="taskIndex.projects.value"
          @navigate-tasks="router.push(desktopRouteLocations.tasks())"
          @navigate-automations="router.push(desktopRouteLocations.automations())"
          @navigate-settings="router.push(desktopRouteLocations.settings())"
          @mark-all-notifications-seen="notifications.markAllSeen"
          @open-notification="openNotification"
          @open-task="openGlobalSearchTask"
          @open-project="openGlobalSearchProject"
          @toggle-sidebar="toggleAppSidebar"
          @refresh-notifications="notifications.load"
        />
      </Transition>

      <div class="desktop-shell__workbench">
        <RouterView />
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
