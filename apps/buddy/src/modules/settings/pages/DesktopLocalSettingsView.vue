<script setup lang="ts">
import { onMounted } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopSettingsPageLayout from '@/modules/settings/layouts/DesktopSettingsPageLayout.vue'
import { useSettingsContext } from '@/modules/settings/settingsContext'
import DesktopConnectorsSettingsTab from '@/modules/settings/widgets/local/DesktopConnectorsSettingsTab.vue'
import DesktopSkillsSettingsTab from '@/modules/settings/widgets/local/DesktopSkillsSettingsTab.vue'

const { localSettings, ready } = useSettingsContext()
const { t } = useBuddyI18n(localSettings.language)

onMounted(() => {
  void ready.then(() => Promise.all([
    localSettings.loadSkills(localSettings.spaceId.value),
    localSettings.loadConnectors(),
  ]))
})
const { skills, skillsError, language, isLoadingSkills, isMutatingConnectors, connectors, connectorsError } = localSettings
</script>

<template>
  <DesktopSettingsPageLayout requires-runtime :loading="isLoadingSkills || localSettings.isLoadingConnectors.value">
    <template #title>
      {{ t('desktop.settings.category.local') }}
    </template>
    <template #description>
      {{ t('desktop.settings.categoryDescription.local') }}
    </template>
    <div class="desktop-local-settings-view">
      <DesktopSkillsSettingsTab
        :catalog="skills"
        :error="skillsError"
        :language="language"
        :loading="false"
      />
      <DesktopConnectorsSettingsTab
        :busy="isMutatingConnectors"
        :connectors="connectors"
        :error="connectorsError"
        :language="language"
        :save-connector="localSettings.saveConnector"
        @clear-credential="localSettings.clearConnectorCredential"
        @remove="localSettings.removeConnector"
        @trust="localSettings.trustConnector"
      />
    </div>
  </DesktopSettingsPageLayout>
</template>

<style scoped>
.desktop-local-settings-view {
  display: grid;
  gap: 2rem;
}
</style>
