<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useDesktopApp } from '@/app/desktopAppContext'
import DesktopWorkbenchLayout from '@/layouts/DesktopWorkbenchLayout.vue'
import DesktopSettingsSidebar from '@/workbenches/settings/components/DesktopSettingsSidebar.vue'

const {
  capabilities: { applicationSettings },
  shell,
  toggleAppSidebar,
} = useDesktopApp()
</script>

<template>
  <DesktopWorkbenchLayout>
    <template #sidebar>
      <DesktopSettingsSidebar
        :app-sidebar-collapsed="shell.appSidebarCollapsed.value"
        :language="applicationSettings.language.value"
        @toggle-app-sidebar="toggleAppSidebar"
      />
    </template>
    <RouterView />
  </DesktopWorkbenchLayout>
</template>
