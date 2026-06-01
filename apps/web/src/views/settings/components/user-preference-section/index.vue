<script setup lang="ts">
import type { AppearancePreference, LanguagePreference } from '@haohaoxue/samepage-contracts'
import type { UserPreferenceSectionProps } from './typing'
import { useUserPreferenceSection } from '../../composables/useUserPreferenceSection'
import UserSettingsSectionHeader from '../section-header'

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

    <div class="mb-5 last:mb-0">
      <div class="mb-3 text-sm font-semibold text-main">
        语言偏好
      </div>
      <ElRadioGroup
        v-model="language"
        :disabled="props.isSavingLanguage"
        class="flex flex-wrap"
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

    <div class="mb-5 last:mb-0">
      <div class="mb-3 text-sm font-semibold text-main">
        外观偏好
      </div>
      <ElRadioGroup
        v-model="appearance"
        :disabled="props.isSavingAppearance"
        class="flex flex-wrap"
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
}
</style>
