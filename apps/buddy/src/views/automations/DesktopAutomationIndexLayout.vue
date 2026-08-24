<script setup lang="ts">
import { RouterView, useRouter } from 'vue-router'
import { useDesktopApp } from '@/app/desktopAppContext'
import { desktopRouteLocations } from '@/router'
import DesktopAutomationWorkbench from '@/workbenches/automations/DesktopAutomationWorkbench.vue'

const router = useRouter()
const {
  capabilities: { applicationSettings, automations },
  shell,
  toggleAppSidebar,
} = useDesktopApp()
</script>

<template>
  <DesktopAutomationWorkbench
    :app-sidebar-collapsed="shell.appSidebarCollapsed.value"
    :automations="automations"
    :language="applicationSettings.language.value"
    @add="router.push(desktopRouteLocations.automationCreate())"
    @toggle-app-sidebar="toggleAppSidebar"
  >
    <RouterView />
  </DesktopAutomationWorkbench>
</template>
