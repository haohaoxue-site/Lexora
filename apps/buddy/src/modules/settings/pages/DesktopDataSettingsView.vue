<script setup lang="ts">
import { onMounted } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopSettingsPageLayout from '@/modules/settings/layouts/DesktopSettingsPageLayout.vue'
import { useSettingsContext } from '@/modules/settings/settingsContext'
import DesktopDataSettings from '@/modules/settings/widgets/data/DesktopDataSettings.vue'

const { dataSettings, ready } = useSettingsContext()
const { t } = useBuddyI18n(dataSettings.language)

onMounted(() => {
  void ready.then(() => dataSettings.loadUsage())
})
const { canRestartRuntime, runtimeRestartError, runtimeError, runtimeState, selectedModel, usageError, usageSnapshot, language, restartRuntime, listRecentRuns, listRunEvents } = dataSettings
</script>

<template>
  <DesktopSettingsPageLayout>
    <template #title>
      {{ t('desktop.settings.category.data') }}
    </template>
    <template #description>
      {{ t('desktop.settings.categoryDescription.data') }}
    </template>
    <DesktopDataSettings
      :can-restart-runtime="canRestartRuntime"
      :runtime-restart-error="runtimeRestartError"
      :runtime-error="runtimeError"
      :runtime-state="runtimeState"
      :selected-model="selectedModel"
      :usage-error="usageError"
      :usage-snapshot="usageSnapshot"
      :language="language"
      :restart-runtime="restartRuntime"
      :list-recent-runs="listRecentRuns"
      :list-run-events="listRunEvents"
    />
  </DesktopSettingsPageLayout>
</template>
