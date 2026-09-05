<script setup lang="ts">
import { onMounted } from 'vue'
import { useDesktopApp } from '@/app/desktopAppContext'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopSettingsPageLayout from '@/workbenches/settings/components/DesktopSettingsPageLayout.vue'
import DesktopWebSettings from '@/workbenches/settings/web/DesktopWebSettings.vue'

const { capabilities: { webSettings }, ready } = useDesktopApp()
const { t } = useBuddyI18n(webSettings.language)
onMounted(() => {
  void ready.then(() => webSettings.load())
})
</script>

<template>
  <DesktopSettingsPageLayout>
    <template #title>
      {{ t('desktop.settings.category.web') }}
    </template>
    <template #description>
      {{ t('desktop.settings.categoryDescription.web') }}
    </template>
    <DesktopWebSettings :capability="webSettings" />
  </DesktopSettingsPageLayout>
</template>
