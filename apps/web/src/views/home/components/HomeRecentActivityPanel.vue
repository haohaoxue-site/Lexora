<script setup lang="ts">
import type { HomeRecentActivityPanelProps } from '../typing'

defineProps<HomeRecentActivityPanelProps>()
</script>

<template>
  <ElCard shadow="never" body-class="home-recent-activity__body" class="home-recent-activity">
    <div class="home-recent-activity__header">
      <h3 class="home-recent-activity__title">
        最近活动
      </h3>
    </div>

    <div class="home-recent-activity__list">
      <article
        v-for="activity in activities"
        :key="activity.id"
        class="home-recent-activity__item"
      >
        <div class="home-recent-activity__dot" />
        <div class="home-recent-activity__item-title">
          {{ activity.title }}
        </div>
        <div v-if="activity.description" class="home-recent-activity__description">
          {{ activity.description }}
        </div>
        <div class="home-recent-activity__time">
          {{ activity.timeLabel }}
        </div>
      </article>
    </div>
  </ElCard>
</template>

<style scoped lang="scss">
.home-recent-activity {
  border: 1px solid color-mix(in srgb, var(--brand-border-base) 80%, transparent);
  border-radius: 1.75rem;
  box-shadow: 0 1px 2px 0 color-mix(in srgb, var(--brand-text-primary) 5%, transparent);

  :deep(.home-recent-activity__body) {
    padding: 1.5rem;
  }

  .home-recent-activity__header {
    margin-bottom: 1.25rem;
  }

  .home-recent-activity__title {
    color: var(--brand-text-primary);
    font-size: 1.125rem;
    font-weight: 600;
    line-height: 1.75rem;
  }

  .home-recent-activity__list {
    > * + * {
      margin-top: 1rem;
    }
  }

  .home-recent-activity__item {
    position: relative;
    padding-left: 1.25rem;
    border-left: 1px solid color-mix(in srgb, var(--brand-border-base) 80%, transparent);
  }

  .home-recent-activity__dot {
    position: absolute;
    top: 0.375rem;
    left: -5px;
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 9999px;
    background: var(--brand-primary);
  }

  .home-recent-activity__item-title {
    color: var(--brand-text-primary);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .home-recent-activity__description {
    margin-top: 0.25rem;
    color: var(--brand-text-secondary);
    font-size: 0.75rem;
    line-height: 1.625;
  }

  .home-recent-activity__time {
    margin-top: 0.5rem;
    color: color-mix(in srgb, var(--brand-primary) 80%, transparent);
    font-size: 12px;
    font-weight: 500;
  }
}
</style>
