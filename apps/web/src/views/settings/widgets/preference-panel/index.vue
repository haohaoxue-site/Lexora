<script setup lang="ts">
import UserPreferenceSection from '../../components/user-preference-section'
import { useSettingsPreferencePage } from '../../composables/useSettingsPreferencePage'

const {
  appearancePreference,
  errorMessage,
  isLoading,
  isSavingAppearance,
  isSavingLanguage,
  languagePreference,
} = useSettingsPreferencePage()
</script>

<template>
  <div v-loading="isLoading" class="settings-preference-page mx-auto max-w-6xl p-6">
    <ElAlert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      :closable="false"
      class="mb-4"
    />

    <UserPreferenceSection
      v-else
      v-model:language="languagePreference"
      v-model:appearance="appearancePreference"
      :is-saving-language="isSavingLanguage"
      :is-saving-appearance="isSavingAppearance"
    />
  </div>
</template>
