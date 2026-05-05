<script setup lang="ts">
import type { UserSettingsSectionHeaderProps } from '../typing'

const props = defineProps<UserSettingsSectionHeaderProps>()
</script>

<template>
  <div class="user-settings-section-header">
    <h2 class="user-settings-section-header__title">
      {{ props.title }}
    </h2>
    <p class="user-settings-section-header__description">
      {{ props.description }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.user-settings-section-header {
  margin-bottom: 1.25rem;

  &__title {
    margin: 0;
    color: var(--brand-text-primary);
    font-size: 1.125rem;
    font-weight: 700;
  }

  &__description {
    margin: 0.375rem 0 0;
    color: var(--brand-text-secondary);
    font-size: 0.875rem;
    line-height: 1.6;
  }
}
</style>
