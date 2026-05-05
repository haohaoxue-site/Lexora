<script setup lang="ts">
import type { ConsoleMetricCardProps } from '../typing'

defineProps<ConsoleMetricCardProps>()
</script>

<template>
  <ElCard shadow="hover" body-class="console-metric-card__body" class="console-metric-card">
    <div class="console-metric-card__header">
      <div class="console-metric-card__copy">
        <p class="console-metric-card__label">
          {{ label }}
        </p>
        <div class="console-metric-card__value">
          {{ value }}
        </div>
      </div>
      <SvgIcon v-if="icon" :category="iconCategory" :icon="icon" size="1.25rem" class="console-metric-card__icon" />
    </div>
    <p class="console-metric-card__detail">
      {{ detail }}
    </p>
  </ElCard>
</template>

<style scoped lang="scss">
.console-metric-card {
  border-color: color-mix(in srgb, var(--brand-border-base) 80%, transparent);
  transition:
    border-color 0.3s ease,
    color 0.3s ease;

  &:hover {
    border-color: color-mix(in srgb, var(--brand-primary) 40%, transparent);
  }

  :deep(.console-metric-card__body) {
    padding: 1.25rem;
  }

  .console-metric-card__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }

  .console-metric-card__copy {
    > * + * {
      margin-top: 0.25rem;
    }
  }

  .console-metric-card__label {
    color: var(--brand-text-secondary);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .console-metric-card__value {
    color: var(--brand-text-primary);
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.025em;
    transition: color 0.3s ease;
  }

  .console-metric-card__icon {
    color: color-mix(in srgb, var(--brand-text-secondary) 40%, transparent);
    font-size: 1.25rem;
    transition: color 0.3s ease;
  }

  .console-metric-card__detail {
    margin-top: 1rem;
    color: var(--brand-text-secondary);
    font-size: 0.75rem;
    line-height: 1.375;
  }

  &:hover {
    .console-metric-card__value,
    .console-metric-card__icon {
      color: var(--brand-primary);
    }
  }
}
</style>
