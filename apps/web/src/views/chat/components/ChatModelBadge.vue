<script setup lang="ts">
import { useChatModelSettings } from '../composables/useChatModelSettings'

const {
  currentModelLabel,
  modelBadgeStateClass,
  openModelSettingsDialog,
} = useChatModelSettings()
</script>

<template>
  <button
    type="button"
    class="chat-model-badge"
    :class="modelBadgeStateClass"
    @click="openModelSettingsDialog"
  >
    <SvgIcon category="ai" icon="ai-spark" size="1rem" class="chat-model-badge__icon" />
    <span class="max-w-52 truncate">{{ currentModelLabel }}</span>
  </button>
</template>

<style scoped lang="scss">
.chat-model-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid transparent;
  border-radius: 8px;
  appearance: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.75rem;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    color 0.2s ease;

  &.configured {
    border-color: color-mix(in srgb, var(--brand-primary) 20%, transparent);
    color: var(--brand-primary);
    background: color-mix(in srgb, var(--brand-primary) 6%, transparent);
  }

  &.idle {
    border-color: color-mix(in srgb, var(--brand-border-base) 80%, transparent);
    color: var(--brand-text-secondary);
    background: var(--brand-bg-surface-raised);
  }

  &:hover {
    border-color: color-mix(in srgb, var(--brand-primary) 20%, transparent);
    color: var(--brand-primary);
    background: var(--brand-bg-surface);
  }

  &__icon {
    display: block;
  }
}
</style>
