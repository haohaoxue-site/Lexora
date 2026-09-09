<script setup lang="ts">
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { requireDesktopApi } from '@/platform/desktop/desktopApi'
import DesktopSettingsPageLayout from '../layouts/DesktopSettingsPageLayout.vue'
import { useSettingsContext } from '../settingsContext'
import DesktopApplicationLogs from '../widgets/application-logs/DesktopApplicationLogs.vue'

const { applicationSettings } = useSettingsContext()
const { language } = applicationSettings
const { t } = useBuddyI18n(language)
const api = requireDesktopApi().app.logs
</script>

<template>
  <DesktopSettingsPageLayout fill :requires-runtime="false">
    <template #title>
      {{ t('desktop.settings.category.logs') }}
    </template>
    <template #description>
      {{ t('applicationLogs.description') }}
    </template>
    <DesktopApplicationLogs :api="api" :language="language" />
  </DesktopSettingsPageLayout>
</template>
