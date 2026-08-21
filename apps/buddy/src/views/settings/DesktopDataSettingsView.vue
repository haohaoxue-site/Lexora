<script setup lang="ts">
import { onMounted } from 'vue'
import { useDesktopApp } from '@/app/desktopAppContext'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopSettingsPageLayout from '@/workbenches/settings/components/DesktopSettingsPageLayout.vue'
import DesktopDataSettings from '@/workbenches/settings/data/DesktopDataSettings.vue'

const { capabilities: { dataSettings }, ready } = useDesktopApp()
const { t } = useBuddyI18n(dataSettings.language)

onMounted(() => {
  void ready.then(() => Promise.all([
    dataSettings.loadUsage(),
    dataSettings.loadRuntimeDataBackups(),
  ]))
})
</script>

<template>
  <DesktopSettingsPageLayout>
    <template #title>
      {{ t('desktop.settings.category.data') }}
    </template>
    <template #description>
      {{ t('desktop.settings.categoryDescription.data') }}
    </template>
    <DesktopDataSettings :data-settings="dataSettings" />
  </DesktopSettingsPageLayout>
</template>
