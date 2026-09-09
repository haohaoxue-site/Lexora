<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { DesktopModelsSettings } from '@/modules/models/ui'
import DesktopSettingsPageLayout from '@/modules/settings/layouts/DesktopSettingsPageLayout.vue'
import { useSettingsContext } from '@/modules/settings/settingsContext'
import { desktopRouteLocations } from '@/shared/navigation/desktopRoutes'

const router = useRouter()
const { providerSettings } = useSettingsContext()
const { t } = useBuddyI18n(providerSettings.language)
</script>

<template>
  <DesktopSettingsPageLayout requires-runtime :loading="providerSettings.isLoadingModelCatalog.value">
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
