<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useSettingsContext } from '@/modules/settings/settingsContext'
import DesktopSettingsSidebar from '@/modules/settings/widgets/navigation/DesktopSettingsSidebar.vue'
import DesktopWorkbenchLayout from '@/shared/ui/workbench-layout/DesktopWorkbenchLayout.vue'

const {
  applicationSettings,
  appSidebarCollapsed,
  platformCapabilities,
} = useSettingsContext()
const { language } = applicationSettings
</script>

<template>
  <DesktopWorkbenchLayout :language="language">
    <template #sidebar>
      <DesktopSettingsSidebar
        :app-sidebar-collapsed="appSidebarCollapsed"
        :language="language"
        :capabilities="platformCapabilities"
      />
    </template>
    <RouterView />
  </DesktopWorkbenchLayout>
</template>
