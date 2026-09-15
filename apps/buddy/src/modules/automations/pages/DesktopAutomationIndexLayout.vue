<script setup lang="ts">
import { RouterView, useRouter } from 'vue-router'
import { useAutomationContext } from '@/modules/automations/automationContext'
import DesktopAutomationWorkbench from '@/modules/automations/layouts/DesktopAutomationWorkbench.vue'
import { desktopRouteLocations } from '@/shared/navigation/desktopRoutes'
import { useDesktopUi } from '@/shared/ui/desktopUiContext'

const router = useRouter()
const { language } = useDesktopUi()
const { automations } = useAutomationContext()
</script>

<template>
  <DesktopAutomationWorkbench
    :automations="automations"
    :language="language"
    @add="router.push(desktopRouteLocations.automationCreate())"
  >
    <RouterView />
  </DesktopAutomationWorkbench>
</template>
