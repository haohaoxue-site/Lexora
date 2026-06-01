<script setup lang="ts">
import type { AppearancePreference } from '@haohaoxue/samepage-contracts'
import type { SessionAppearancePanelProps } from '../typing'

const props = defineProps<SessionAppearancePanelProps>()
const emits = defineEmits<{
  select: [mode: AppearancePreference]
}>()
</script>

<template>
  <div class="session-user-menu-subpanel absolute left-[calc(100%+12px)] top-1/2 z-[8] w-[216px] -translate-y-1/2 p-2.5">
    <ul class="m-0 flex flex-col gap-1.5 p-0 list-none">
      <li
        v-for="option in props.options"
        :key="option.value"
        class="session-appearance-option list-none"
        :class="{
          'is-active': props.currentAppearance === option.value,
          'is-disabled': props.isSaving,
        }"
      >
        <button
          type="button"
          class="session-appearance-option__button flex min-h-11 w-full items-center rounded-lg border-0 bg-transparent px-2.5 py-2"
          :disabled="props.isSaving"
          @click.stop="emits('select', option.value)"
        >
          <span class="session-appearance-option__content flex h-full w-full items-center justify-between gap-4 text-left">
            <span class="session-appearance-option__label min-w-0">
              <span class="truncate text-[13px] leading-none font-medium text-main">
                {{ option.label }}
              </span>
            </span>

            <span class="session-appearance-option__indicator flex w-4 shrink-0 items-center justify-center">
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
.session-user-menu-subpanel {
  border: 1px solid color-mix(in srgb, var(--brand-border-base) 94%, transparent);
  border-radius: 12px;
  background: var(--brand-bg-surface-raised);
  box-shadow:
    0 16px 36px color-mix(in srgb, var(--brand-text-primary) 9%, transparent),
    0 4px 12px color-mix(in srgb, var(--brand-text-primary) 5%, transparent);
}

.session-appearance-option__button {
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
    background: color-mix(in srgb, var(--brand-fill-lighter) 76%, var(--brand-text-primary) 6%);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.72;
  }
}

.session-appearance-option.is-active .session-appearance-option__button {
  color: var(--brand-primary);
  background: color-mix(in srgb, var(--brand-primary) 10%, transparent);

  :deep(.text-main) {
    color: var(--brand-primary);
  }
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
