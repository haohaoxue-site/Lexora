<script setup lang="ts">
import { onMounted } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopSettingsPageLayout from '@/modules/settings/layouts/DesktopSettingsPageLayout.vue'
import { useSettingsContext } from '@/modules/settings/settingsContext'
import DesktopWebSettings from '@/modules/settings/widgets/web/DesktopWebSettings.vue'

const { webSettings, ready } = useSettingsContext()
const { t } = useBuddyI18n(webSettings.language)
onMounted(() => {
  void ready.then(() => webSettings.load())
})
const { busy, error, language, snapshot, searchSources, load, setSearchEnabled, reorderSearch, setFetchEnabled, saveCredential, revealCredential } = webSettings
</script>

<template>
  <DesktopSettingsPageLayout>
    <template #title>
      {{ t('desktop.settings.category.web') }}
    </template>
    <template #description>
      {{ t('desktop.settings.categoryDescription.web') }}
    </template>
    <DesktopWebSettings
      :busy="busy"
      :error="error"
      :language="language"
      :snapshot="snapshot"
      :search-sources="searchSources"
      :load="load"
      :set-search-enabled="setSearchEnabled"
      :reorder-search="reorderSearch"
      :set-fetch-enabled="setFetchEnabled"
      :save-credential="saveCredential"
      :reveal-credential="revealCredential"
    />
  </DesktopSettingsPageLayout>
</template>
