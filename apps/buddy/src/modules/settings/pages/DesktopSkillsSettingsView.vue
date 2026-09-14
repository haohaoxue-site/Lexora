<script setup lang="ts">
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { DesktopSkillsManager } from '@/modules/skills/ui'
import DesktopSettingsPageLayout from '../layouts/DesktopSettingsPageLayout.vue'
import { useSettingsContext } from '../settingsContext'

const { applicationSettings } = useSettingsContext()
const { t } = useBuddyI18n(applicationSettings.language)
</script>

<template>
  <DesktopSettingsPageLayout requires-runtime>
    <template #title>
      {{ t('desktop.settings.category.skills') }}
    </template>
    <template #description>
      {{ t('desktop.skills.description') }}
    </template>
    <DesktopSkillsManager />
  </DesktopSettingsPageLayout>
</template>
