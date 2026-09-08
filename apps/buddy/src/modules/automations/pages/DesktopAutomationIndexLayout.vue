<script setup lang="ts">
import { RouterView, useRouter } from 'vue-router'
import { useAutomationContext } from '@/modules/automations/automationContext'
import DesktopAutomationWorkbench from '@/modules/automations/layouts/DesktopAutomationWorkbench.vue'
import { desktopRouteLocations } from '@/shared/navigation/desktopRoutes'

const router = useRouter()
const {
  language,
  automations,
  appSidebarCollapsed,
  toggleAppSidebar,
} = useAutomationContext()
</script>

<template>
  <DesktopAutomationWorkbench
    :app-sidebar-collapsed="appSidebarCollapsed"
    :automations="automations"
    :language="language"
    @add="router.push(desktopRouteLocations.automationCreate())"
    @toggle-app-sidebar="toggleAppSidebar"
  >
    <RouterView />
  </DesktopAutomationWorkbench>
</template>
