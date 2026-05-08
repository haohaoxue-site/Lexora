<script setup lang="ts">
import UserPreferenceSection from '../components/UserPreferenceSection.vue'
import { useSettingsPreferencePage } from '../composables/useSettingsPreferencePage'

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
  <div v-loading="isLoading" class="settings-preference-page">
    <ElAlert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      :closable="false"
      class="settings-preference-page__alert"
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

<style scoped lang="scss">
.settings-preference-page {
  max-width: 72rem;
  margin-inline: auto;
  padding: 1.5rem;

  &__alert {
    margin-bottom: 1rem;
  }
}
</style>
