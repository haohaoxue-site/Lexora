<script setup lang="ts">
import type { HomeWelcomePanelProps } from '../typing'

defineProps<HomeWelcomePanelProps>()
</script>

<template>
  <ElCard
    shadow="never"
    body-class="home-welcome-panel__body"
    class="home-welcome-panel"
  >
    <div class="home-welcome-panel__layout">
      <div class="home-welcome-panel__copy">
        <h1 class="home-welcome-panel__title">
          {{ overview.title }}
        </h1>

        <p v-if="overview.description" class="home-welcome-panel__description">
          {{ overview.description }}
        </p>
      </div>

      <div class="home-welcome-panel__date-card">
        <div class="home-welcome-panel__date-label">
          今日
        </div>
        <div class="home-welcome-panel__date-value">
          {{ overview.dateLabel }}
        </div>
      </div>
    </div>
  </ElCard>
</template>

<style scoped lang="scss">
.home-welcome-panel {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--brand-border-base) 60%, transparent);
  border-radius: 2rem;
  background-image: linear-gradient(
    135deg,
    var(--brand-bg-surface-raised) 0%,
    color-mix(in srgb, var(--brand-bg-surface) 78%, var(--brand-bg-body)) 100%
  );
  box-shadow: var(--brand-shadow-floating);

  :deep(.home-welcome-panel__body) {
    padding: 2rem;
  }

  .home-welcome-panel__layout {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1.5rem;
    color: var(--brand-text-primary);
  }

  .home-welcome-panel__copy {
    max-width: 42rem;
  }

  .home-welcome-panel__title {
    margin-top: 0.75rem;
    color: var(--brand-text-primary);
    font-size: 2.25rem;
    line-height: 1.08;
    letter-spacing: -0.04em;
    text-wrap: balance;
    font-family: 'Inter', -apple-system, sans-serif;
  }

  .home-welcome-panel__description {
    max-width: 36rem;
    margin-top: 1rem;
    color: var(--brand-text-regular);
    font-size: 15px;
    line-height: 1.75rem;
  }

  .home-welcome-panel__date-card {
    padding: 1rem 1.25rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 70%, transparent);
    border-radius: 24px;
    background: color-mix(in srgb, var(--brand-bg-surface-raised) 80%, transparent);
    backdrop-filter: blur(12px);
    box-shadow: var(--brand-shadow-floating);
  }

  .home-welcome-panel__date-label {
    color: var(--brand-text-secondary);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .home-welcome-panel__date-value {
    margin-top: 0.5rem;
    color: var(--brand-text-primary);
    font-size: 1.125rem;
    font-weight: 600;
    text-align: right;
  }
}
</style>
