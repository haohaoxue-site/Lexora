<script setup lang="ts">
import type { AppearancePreference, LanguagePreference } from '@haohaoxue/samepage-contracts'
import type { UserPreferenceSectionProps } from '../typing'
import { useUserPreferenceSection } from '../composables/useUserPreferenceSection'
import UserSettingsSectionHeader from './UserSettingsSectionHeader.vue'

const props = defineProps<UserPreferenceSectionProps>()
const language = defineModel<LanguagePreference>('language', { required: true })
const appearance = defineModel<AppearancePreference>('appearance', { required: true })
const {
  appearanceOptions,
  formatAppearancePreference,
  formatLanguagePreference,
  languageOptions,
} = useUserPreferenceSection()
</script>

<template>
  <ElCard shadow="never" class="user-preference-section">
    <UserSettingsSectionHeader
      title="偏好设置"
      description="设置常用语言和页面外观。"
    />

    <div class="user-preference-section__group">
      <div class="user-preference-section__label">
        语言偏好
      </div>
      <ElRadioGroup
        v-model="language"
        :disabled="props.isSavingLanguage"
        class="user-preference-section__options"
      >
        <ElRadioButton
          v-for="item in languageOptions"
          :key="item"
          :label="item"
          :value="item"
        >
          {{ formatLanguagePreference(item) }}
        </ElRadioButton>
      </ElRadioGroup>
    </div>

    <div class="user-preference-section__group">
      <div class="user-preference-section__label">
        外观偏好
      </div>
      <ElRadioGroup
        v-model="appearance"
        :disabled="props.isSavingAppearance"
        class="user-preference-section__options"
      >
        <ElRadioButton
          v-for="item in appearanceOptions"
          :key="item"
          :label="item"
          :value="item"
        >
          {{ formatAppearancePreference(item) }}
        </ElRadioButton>
      </ElRadioGroup>
    </div>
  </ElCard>
</template>

<style scoped lang="scss">
.user-preference-section {
  border-color: color-mix(in srgb, var(--brand-border-base) 85%, transparent);

  &__group {
    margin-bottom: 1.25rem;
  }

  &__label {
    margin-bottom: 0.75rem;
    color: var(--brand-text-primary);
    font-size: 0.875rem;
    font-weight: 600;
  }

  &__options {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  &__hint {
    margin: 0.625rem 0 0;
    color: var(--brand-text-secondary);
    font-size: 0.8125rem;
    line-height: 1.5;
  }
}
</style>
