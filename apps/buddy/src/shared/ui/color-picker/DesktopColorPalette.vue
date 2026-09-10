<script setup lang="ts" generic="T extends string">
import { Checkmark16Regular } from '@vicons/fluent'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'

defineProps<{
  disabled?: boolean
  options: readonly { value: T, color: string, reset?: boolean }[]
}>()
const value = defineModel<T>({ required: true })
</script>

<template>
  <div class="desktop-color-palette">
    <button
      v-for="option in options"
      :key="option.value"
      class="desktop-color-palette__swatch"
      :class="{ 'is-selected': value === option.value, 'is-reset': option.reset }"
      :style="{ '--swatch-color': option.color }"
      type="button"
      :disabled="disabled"
      :aria-label="option.value"
      :data-color="option.value"
      :aria-pressed="value === option.value"
      @click="value = option.value"
    >
      <DesktopIcon v-if="value === option.value" class="desktop-color-palette__check" :component="Checkmark16Regular" :size="14" />
    </button>
  </div>
</template>

<style scoped>
.desktop-color-palette {
  display: grid;
  grid-auto-flow: column;
  grid-template-columns: repeat(9, 24px);
  grid-template-rows: repeat(3, 24px);
  justify-content: space-between;
  row-gap: 5px;
}

.desktop-color-palette__swatch {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: var(--swatch-color);
  cursor: pointer;
}

.desktop-color-palette__swatch.is-reset {
  border-color: var(--buddy-border-strong);
  background: linear-gradient(135deg, var(--buddy-surface-raised) 47%, var(--buddy-text-secondary) 48%, var(--buddy-text-secondary) 52%, var(--buddy-surface-raised) 53%);
}

.desktop-color-palette__swatch:not(:disabled):hover,
.desktop-color-palette__swatch.is-selected {
  box-shadow: 0 0 0 1px var(--buddy-surface-raised), 0 0 0 2px var(--swatch-color);
}

.desktop-color-palette__swatch:disabled {
  cursor: default;
}

.desktop-color-palette__check {
  border-radius: 3px;
  background: var(--buddy-surface-raised);
  color: var(--buddy-text-strong);
}

.desktop-color-palette__swatch:focus-visible {
  outline: 2px solid var(--buddy-focus-ring);
  outline-offset: 2px;
}
</style>
