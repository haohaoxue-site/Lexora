<script setup lang="ts">
import type { UserSettingsSectionHeaderProps } from '../typing'

const props = defineProps<UserSettingsSectionHeaderProps>()

defineSlots<{
  aside?: () => unknown
}>()
</script>

<template>
  <div class="user-settings-section-header">
    <div class="user-settings-section-header__content">
      <h2 class="user-settings-section-header__title">
        {{ props.title }}
      </h2>
      <p v-if="props.description" class="user-settings-section-header__description">
        {{ props.description }}
      </p>
    </div>

    <div v-if="$slots.aside" class="user-settings-section-header__aside">
      <slot name="aside" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.user-settings-section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;

  &__content {
    min-width: 0;
  }

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

  &__aside {
    flex-shrink: 0;
    margin-left: auto;
  }

  @media (max-width: 640px) {
    flex-direction: column;

    &__aside {
      width: 100%;
      margin-left: 0;
    }
  }
}
</style>
