<script setup lang="ts">
import type { HomeSchedulePanelProps } from '../typing'

defineProps<HomeSchedulePanelProps>()
</script>

<template>
  <ElCard shadow="never" body-class="home-schedule-panel__body" class="home-schedule-panel">
    <div class="home-schedule-panel__header">
      <h3 class="home-schedule-panel__title">
        日程
      </h3>
    </div>

    <div class="home-schedule-panel__list">
      <article
        v-for="item in schedules"
        :key="item.id"
        class="home-schedule-panel__item"
      >
        <div class="home-schedule-panel__time">
          {{ item.timeLabel }}
        </div>
        <div class="home-schedule-panel__copy">
          <div class="home-schedule-panel__item-title">
            {{ item.title }}
          </div>
          <div v-if="item.description" class="home-schedule-panel__description">
            {{ item.description }}
          </div>
        </div>
      </article>
    </div>
  </ElCard>
</template>

<style scoped lang="scss">
.home-schedule-panel {
  border: 1px solid color-mix(in srgb, var(--brand-border-base) 80%, transparent);
  border-radius: 1.75rem;
  box-shadow: 0 1px 2px 0 color-mix(in srgb, var(--brand-text-primary) 5%, transparent);

  :deep(.home-schedule-panel__body) {
    padding: 1.5rem;
  }

  .home-schedule-panel__header {
    margin-bottom: 1.25rem;
  }

  .home-schedule-panel__title {
    color: var(--brand-text-primary);
    font-size: 1.125rem;
    font-weight: 600;
    line-height: 1.75rem;
  }

  .home-schedule-panel__list {
    > * + * {
      margin-top: 0.75rem;
    }
  }

  .home-schedule-panel__item {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 70%, transparent);
    border-radius: 1rem;
    background: var(--brand-fill-lighter);
  }

  .home-schedule-panel__time {
    padding: 0.5rem 0.75rem;
    border-radius: 1rem;
    color: var(--brand-primary);
    font-size: 0.875rem;
    font-weight: 600;
    background: color-mix(in srgb, var(--brand-primary) 10%, transparent);
  }

  .home-schedule-panel__copy {
    flex: 1 1 0%;
    min-width: 0;
  }

  .home-schedule-panel__item-title {
    color: var(--brand-text-primary);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .home-schedule-panel__description {
    margin-top: 0.25rem;
    color: var(--brand-text-secondary);
    font-size: 0.75rem;
    line-height: 1.625;
  }
}
</style>
