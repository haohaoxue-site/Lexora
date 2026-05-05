<script setup lang="ts">
import type { HomeQuickActionsPanelProps } from '../typing'

defineProps<HomeQuickActionsPanelProps>()
</script>

<template>
  <ElCard shadow="never" body-class="home-quick-actions__body" class="home-quick-actions">
    <div class="home-quick-actions__header">
      <h3 class="home-quick-actions__title">
        快速操作
      </h3>
    </div>

    <div class="home-quick-actions__list">
      <RouterLink
        v-for="action in actions"
        :key="action.id"
        :to="action.to"
        class="home-quick-actions__item"
      >
        <div class="home-quick-actions__icon-shell">
          <SvgIcon :category="action.iconCategory" :icon="action.icon" size="1.25rem" />
        </div>
        <div class="home-quick-actions__copy">
          <div class="home-quick-actions__item-title">
            {{ action.title }}
          </div>
          <div v-if="action.description" class="home-quick-actions__description">
            {{ action.description }}
          </div>
        </div>
        <SvgIcon category="ui" icon="arrow-up-right" size="1rem" class="home-quick-actions__arrow" />
      </RouterLink>
    </div>
  </ElCard>
</template>

<style scoped lang="scss">
.home-quick-actions {
  border: 1px solid color-mix(in srgb, var(--brand-border-base) 80%, transparent);
  border-radius: 1.75rem;
  box-shadow: 0 1px 2px 0 color-mix(in srgb, var(--brand-text-primary) 5%, transparent);

  :deep(.home-quick-actions__body) {
    padding: 1.5rem;
  }

  .home-quick-actions__header {
    margin-bottom: 1.25rem;
  }

  .home-quick-actions__title {
    color: var(--brand-text-primary);
    font-size: 1.125rem;
    font-weight: 600;
    line-height: 1.75rem;
  }

  .home-quick-actions__list {
    display: grid;
    gap: 0.75rem;
  }

  .home-quick-actions__item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 70%, transparent);
    border-radius: 1rem;
    color: var(--brand-text-primary);
    text-decoration: none;
    background: var(--brand-bg-surface-raised);
    transition:
      border-color 0.2s ease,
      background-color 0.2s ease,
      box-shadow 0.2s ease,
      color 0.2s ease;

    &:hover {
      border-color: color-mix(in srgb, var(--brand-primary) 20%, transparent);
      background: var(--brand-bg-surface);

      .home-quick-actions__arrow {
        color: var(--brand-primary);
      }
    }
  }

  .home-quick-actions__icon-shell {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 2.75rem;
    height: 2.75rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 60%, transparent);
    border-radius: 1rem;
    color: var(--brand-primary);
    background: var(--brand-bg-surface);
    box-shadow: 0 1px 2px 0 color-mix(in srgb, var(--brand-text-primary) 5%, transparent);
  }

  .home-quick-actions__copy {
    flex: 1 1 0%;
    min-width: 0;
  }

  .home-quick-actions__item-title {
    font-size: 0.875rem;
    font-weight: 600;
  }

  .home-quick-actions__description {
    margin-top: 0.25rem;
    color: var(--brand-text-secondary);
    font-size: 0.75rem;
    line-height: 1.625;
  }

  .home-quick-actions__arrow {
    color: var(--brand-text-secondary);
    transition: color 0.2s ease;
  }
}
</style>
