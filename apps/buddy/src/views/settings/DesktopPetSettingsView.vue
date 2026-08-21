<script setup lang="ts">
import { useDesktopApp } from '@/app/desktopAppContext'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopSettingsPageLayout from '@/workbenches/settings/components/DesktopSettingsPageLayout.vue'
import DesktopPetSettings from '@/workbenches/settings/pet/DesktopPetSettings.vue'

const { capabilities: { applicationSettings } } = useDesktopApp()
const { t } = useBuddyI18n(applicationSettings.language)
</script>

<template>
  <DesktopSettingsPageLayout>
    <template #title>
      {{ t('desktop.settings.category.pet') }}
    </template>
    <template #description>
      {{ t('desktop.settings.categoryDescription.pet') }}
    </template>
    <DesktopPetSettings :settings="applicationSettings" />
  </DesktopSettingsPageLayout>
</template>
