<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useDesktopApp } from '@/app/desktopAppContext'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { desktopRouteLocations } from '@/router'
import DesktopSettingsPageLayout from '@/workbenches/settings/components/DesktopSettingsPageLayout.vue'
import DesktopModelsSettings from '@/workbenches/settings/models/DesktopModelsSettings.vue'

const router = useRouter()
const { capabilities: { providerSettings } } = useDesktopApp()
const { t } = useBuddyI18n(providerSettings.language)
</script>

<template>
  <DesktopSettingsPageLayout>
    <template #title>
      {{ t('desktop.settings.category.models') }}
    </template>
    <template #description>
      {{ t('desktop.settings.categoryDescription.models') }}
    </template>
    <DesktopModelsSettings
      :provider-settings="providerSettings"
      @manage-provider="router.push(desktopRouteLocations.provider($event))"
    />
  </DesktopSettingsPageLayout>
</template>
