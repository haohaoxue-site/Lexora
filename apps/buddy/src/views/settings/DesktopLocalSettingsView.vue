<script setup lang="ts">
import { onMounted } from 'vue'
import { useDesktopApp } from '@/app/desktopAppContext'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopSettingsPageLayout from '@/workbenches/settings/components/DesktopSettingsPageLayout.vue'
import DesktopConnectorsSettingsTab from '@/workbenches/settings/local/DesktopConnectorsSettingsTab.vue'
import DesktopSkillsSettingsTab from '@/workbenches/settings/local/DesktopSkillsSettingsTab.vue'

const { capabilities: { localSettings }, ready } = useDesktopApp()
const { t } = useBuddyI18n(localSettings.language)

onMounted(() => {
  void ready.then(() => Promise.all([
    localSettings.loadSkills(localSettings.projectId.value),
    localSettings.loadConnectors(),
  ]))
})
</script>

<template>
  <DesktopSettingsPageLayout>
    <template #title>
      {{ t('desktop.settings.category.local') }}
    </template>
    <template #description>
      {{ t('desktop.settings.categoryDescription.local') }}
    </template>
    <div class="desktop-local-settings-view">
      <DesktopSkillsSettingsTab :local-settings="localSettings" />
      <DesktopConnectorsSettingsTab :local-settings="localSettings" />
    </div>
  </DesktopSettingsPageLayout>
</template>

<style scoped>
.desktop-local-settings-view {
  display: grid;
  gap: 2rem;
}
</style>
