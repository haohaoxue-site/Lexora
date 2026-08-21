<script setup lang="ts">
import { useDesktopApp } from '@/app/desktopAppContext'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopGeneralSettingsTab from '@/workbenches/settings/app/DesktopGeneralSettingsTab.vue'
import DesktopSettingsPageLayout from '@/workbenches/settings/components/DesktopSettingsPageLayout.vue'

const { capabilities: { applicationSettings }, shell } = useDesktopApp()
const { t } = useBuddyI18n(applicationSettings.language)
</script>

<template>
  <DesktopSettingsPageLayout>
    <template #title>
      {{ t('desktop.settings.category.app') }}
    </template>
    <template #description>
      {{ t('desktop.settings.categoryDescription.app') }}
    </template>
    <DesktopGeneralSettingsTab
      :app-info="shell.appInfo.value"
      :settings="applicationSettings"
    />
  </DesktopSettingsPageLayout>
</template>
