<script setup lang="ts">
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopSettingsPageLayout from '@/modules/settings/layouts/DesktopSettingsPageLayout.vue'
import { useSettingsContext } from '@/modules/settings/settingsContext'
import DesktopPetSettings from '@/modules/settings/widgets/pet/DesktopPetSettings.vue'

const { applicationSettings } = useSettingsContext()
const { t } = useBuddyI18n(applicationSettings.language)
const { config, settingsError, language, updateSettings } = applicationSettings
</script>

<template>
  <DesktopSettingsPageLayout>
    <template #title>
      {{ t('desktop.settings.category.pet') }}
    </template>
    <template #description>
      {{ t('desktop.settings.categoryDescription.pet') }}
    </template>
    <DesktopPetSettings :config="config" :error="settingsError" :language="language" :update-settings="updateSettings" />
  </DesktopSettingsPageLayout>
</template>
