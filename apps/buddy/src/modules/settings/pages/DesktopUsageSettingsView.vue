<script setup lang="ts">
import { NButton } from 'naive-ui'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { requireDesktopApi } from '@/platform/desktop/desktopApi'
import DesktopSettingsPageLayout from '../layouts/DesktopSettingsPageLayout.vue'
import { useSettingsContext } from '../settingsContext'
import { useUsageAnalytics } from '../state/useUsageAnalytics'
import DesktopUsageDashboard from '../widgets/usage/DesktopUsageDashboard.vue'

const { applicationSettings, dataSettings, providerSettings, ready, openTask } = useSettingsContext()
const { language } = applicationSettings
const { providers, registeredModels } = providerSettings
const { t } = useBuddyI18n(language)
const analytics = useUsageAnalytics({ api: requireDesktopApi().localChat.usage, language, runtime: dataSettings.runtimeState, ready })
const { loading, refresh } = analytics
</script>

<template>
  <DesktopSettingsPageLayout requires-runtime :loading="loading">
    <template #title>
      {{ t('desktop.settings.category.usage') }}
    </template>
    <template #description>
      {{ t('usageAnalytics.description') }}
    </template>
    <template #actions>
      <NButton size="small" secondary :loading="loading" @click="refresh">
        {{ t('usageAnalytics.refresh') }}
      </NButton>
    </template>
    <DesktopUsageDashboard :analytics="analytics" :language="language" :providers="providers" :catalog="registeredModels" @open-task="openTask" />
  </DesktopSettingsPageLayout>
</template>
