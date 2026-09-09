<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import DesktopStartupScreen from '@/app/bootstrap/DesktopStartupScreen.vue'
import { useDesktopApp } from '@/app/desktopAppContext'
import DesktopAppSidebar from '@/app/shell/DesktopAppSidebar.vue'
import DesktopTitleBar from '@/app/shell/window/DesktopTitleBar.vue'
import { desktopRouteLocations } from '@/shared/navigation/desktopRoutes'

const route = useRoute()
const router = useRouter()
const { lifecycle, appInfo, appSidebarCollapsed, language, navigation, notifications, taskIndex, toggleAppSidebar } = useDesktopApp()
const { spaces, tasks: taskItems } = taskIndex
const {
  items: notificationItems,
  isLoading: notificationLoading,
  unseenCount: notificationUnseenCount,
  load: loadNotifications,
  markAllSeen: markAllNotificationsSeen,
} = notifications
const startupVisible = computed(() => !lifecycle.state.value.hasBeenReady && route.meta.settingsCategory !== 'logs')
const startupFailed = lifecycle.failed
const activeView = computed(() => route.meta.desktopView ?? 'tasks')
</script>

<template>
  <div class="desktop-shell">
    <DesktopTitleBar
      :app-info="appInfo"
      :app-sidebar-collapsed="appSidebarCollapsed"
      :language="language"
      @toggle-app-sidebar="toggleAppSidebar"
    />
    <div class="desktop-shell__body">
      <div class="desktop-shell__content" :class="{ 'is-starting': startupVisible }" :inert="startupVisible" :aria-hidden="startupVisible">
        <Transition name="desktop-app-sidebar">
          <DesktopAppSidebar
            v-if="!appSidebarCollapsed"
            :app-version="appInfo?.version ?? null"
            :conversations="taskItems"
            :language="language"
            :mode="activeView"
            :notification-items="notificationItems"
            :notification-loading="notificationLoading"
            :notification-unseen-count="notificationUnseenCount"
            :spaces="spaces"
            @navigate-tasks="navigation.navigate(desktopRouteLocations.tasks())"
            @navigate-automations="navigation.navigate(desktopRouteLocations.automations())"
            @navigate-settings="navigation.navigate(desktopRouteLocations.settings())"
            @mark-all-notifications-seen="markAllNotificationsSeen"
            @open-notification="navigation.openNotification"
            @open-task="navigation.openTask"
            @open-space="navigation.openSpace"
            @refresh-notifications="loadNotifications"
          />
        </Transition>

        <div class="desktop-shell__workbench">
          <RouterView />
        </div>
      </div>
      <Transition name="desktop-startup-reveal">
        <DesktopStartupScreen v-if="startupVisible" :failed="startupFailed" :language="language" @retry="lifecycle.retry()" @open-logs="router.push(desktopRouteLocations.settings('logs'))" />
      </Transition>
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
  background: var(--buddy-surface-canvas);
}

.desktop-shell__body,
.desktop-shell__content,
.desktop-shell__workbench {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
}

.desktop-shell__body { position: relative; }
.desktop-shell__content { transition: opacity 220ms ease; }
.desktop-shell__content.is-starting { opacity: 0; }
.desktop-startup-reveal-leave-active { transition: opacity 220ms ease; }
.desktop-startup-reveal-leave-to { opacity: 0; }

.desktop-shell__workbench {
  background: var(--buddy-surface-base);
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
  .desktop-shell__content,
  .desktop-startup-reveal-leave-active,
  .desktop-app-sidebar-enter-active,
  .desktop-app-sidebar-leave-active {
    transition: none;
  }
}
</style>
