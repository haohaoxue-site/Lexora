<script setup lang="ts">
import { ArrowDown16Regular } from '@vicons/fluent'
import { NIcon } from 'naive-ui'

defineProps<{
  label: string
}>()

const emit = defineEmits<{
  activate: []
}>()
</script>

<template>
  <button
    :aria-label="label"
    class="buddy-chat-return-to-latest"
    type="button"
    @click="emit('activate')"
  >
    <NIcon
      aria-hidden="true"
      :component="ArrowDown16Regular"
      class="buddy-chat-return-to-latest__icon"
    />
  </button>
</template>

<style scoped lang="scss">
.buddy-chat-return-to-latest {
  display: inline-flex;
  width: 1.75rem;
  min-width: 1.75rem;
  height: 1.75rem;
  min-height: 1.75rem;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: var(--buddy-radius-micro);
  background: var(--buddy-surface-raised);
  box-shadow: var(--buddy-shadow-soft);
  color: var(--buddy-text-secondary);
  cursor: pointer;
  font: inherit;
  padding: 0;
  transition:
    border-color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing),
    background-color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing),
    color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing);

  &:hover {
    border-color: var(--buddy-accent-border);
    background: color-mix(
      in srgb,
      var(--buddy-accent-text) 8%,
      var(--buddy-surface-raised) 92%
    );
    color: var(--buddy-accent-text);
  }

  &:active {
    background: color-mix(
      in srgb,
      var(--buddy-accent-text) 14%,
      var(--buddy-surface-raised) 86%
    );
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: 2px;
  }
}

.buddy-chat-return-to-latest__icon {
  width: 1rem;
  height: 1rem;
  flex: 0 0 auto;
  font-size: 1rem;
}

@media (prefers-reduced-motion: reduce) {
  .buddy-chat-return-to-latest {
    transition: none;
  }
}
</style>
