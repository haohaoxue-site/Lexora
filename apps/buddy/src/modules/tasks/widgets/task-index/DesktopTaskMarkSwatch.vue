<script setup lang="ts">
defineProps<{ color?: string | null, compact?: boolean }>()
</script>

<template>
  <span class="desktop-task-mark-swatch" :class="{ 'is-empty': !color, 'is-compact': compact }" :style="{ backgroundColor: color ?? undefined }" aria-hidden="true" />
</template>

<style scoped>
.desktop-task-mark-swatch {
  display: inline-block;
  width: 8px;
  height: 8px;
  flex: none;
  border: 1px solid color-mix(in srgb, var(--buddy-text-primary) 18%, transparent);
  border-radius: 2px;
  box-sizing: border-box;
}
.desktop-task-mark-swatch.is-empty { visibility: hidden; }
.desktop-task-mark-swatch.is-compact {
  width: 3px;
  height: 10px;
  border: 0;
  border-radius: 1px;
}
</style>
