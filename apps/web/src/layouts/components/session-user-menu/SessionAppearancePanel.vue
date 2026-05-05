<script setup lang="ts">
import type { AppearancePreference } from '@haohaoxue/samepage-contracts'
import type { SessionAppearancePanelProps } from './typing'

const props = defineProps<SessionAppearancePanelProps>()
const emits = defineEmits<{
  select: [mode: AppearancePreference]
}>()
</script>

<template>
  <div class="session-subpanel">
    <ul class="session-appearance-list">
      <li
        v-for="option in props.options"
        :key="option.value"
        class="session-appearance-option"
        :class="{
          'is-active': props.currentAppearance === option.value,
          'is-disabled': props.isSaving,
        }"
      >
        <button
          type="button"
          class="session-appearance-option__button"
          :disabled="props.isSaving"
          @click.stop="emits('select', option.value)"
        >
          <span class="session-appearance-option__content">
            <span class="session-appearance-option__label">
              <span class="truncate text-[13px] leading-none font-medium text-main">
                {{ option.label }}
              </span>
            </span>

            <span class="session-appearance-option__indicator">
              <SvgIcon
                category="ui"
                icon="check"
                size="14px"
                class="session-appearance-option__check"
                :class="{ 'is-visible': props.currentAppearance === option.value }"
              />
            </span>
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.session-subpanel {
  position: absolute;
  top: 50%;
  right: calc(100% + 14px);
  z-index: 5;
  width: 220px;
  transform: translateY(-50%);
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--brand-border-base) 92%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--brand-bg-surface-raised) 96%, transparent);
  box-shadow: var(--brand-shadow-floating);
  backdrop-filter: blur(16px);
}

.session-appearance-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.session-appearance-option {
  list-style: none;
}

.session-appearance-option__button {
  display: flex;
  width: 100%;
  min-height: 2.75rem;
  align-items: center;
  padding: 0.5rem 0.625rem;
  border: 0;
  border-radius: 0.875rem;
  background: transparent;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    opacity 0.2s ease;

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--brand-primary) 18%, transparent);
    outline-offset: 2px;
  }

  &:hover:not(:disabled) {
    background: var(--brand-fill-light);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.72;
  }
}

.session-appearance-option.is-active .session-appearance-option__button {
  background: color-mix(in srgb, var(--brand-fill-light) 86%, white 14%);
}

.session-appearance-option__content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
  height: 100%;
  text-align: left;
}

.session-appearance-option__label {
  min-width: 0;
}

.session-appearance-option__indicator {
  display: flex;
  width: 1rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
}

.session-appearance-option__check {
  color: var(--brand-primary);
  opacity: 0;
  transition: opacity 0.2s ease;

  &.is-visible {
    opacity: 1;
  }
}
</style>
