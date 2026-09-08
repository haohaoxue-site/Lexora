<script setup lang="ts">
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopSettingsPageLayout from '@/modules/settings/layouts/DesktopSettingsPageLayout.vue'
import { useSettingsContext } from '@/modules/settings/settingsContext'
import DesktopGeneralSettingsTab from '@/modules/settings/widgets/app/DesktopGeneralSettingsTab.vue'

const { applicationSettings, appInfo } = useSettingsContext()
const { t } = useBuddyI18n(applicationSettings.language)
const { config, settingsError, language, updateSettings } = applicationSettings
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
      :app-info="appInfo"
      :config="config"
      :error="settingsError"
      :language="language"
      :update-settings="updateSettings"
    />
  </DesktopSettingsPageLayout>
</template>
