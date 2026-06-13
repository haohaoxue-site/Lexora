<script setup lang="ts">
import type { AuthEntryShellProps, AuthEntryShellSlots } from './typing'

const props = defineProps<AuthEntryShellProps>()

defineSlots<AuthEntryShellSlots>()
</script>

<template>
  <div class="auth-entry-shell relative flex min-h-screen min-h-dvh items-center justify-center overflow-hidden p-5">
    <div class="auth-entry-shell__backdrop auth-entry-shell__backdrop--top" aria-hidden="true" />
    <div class="auth-entry-shell__backdrop auth-entry-shell__backdrop--bottom" aria-hidden="true" />

    <ElCard shadow="never" body-class="!p-0" class="auth-entry-shell__card relative w-full max-w-[32rem] overflow-hidden rounded-lg">
      <section
        class="auth-entry-shell__panel relative flex flex-col gap-6 p-7 backdrop-blur-[8px]"
      >
        <div v-if="$slots.actions" class="auth-entry-shell__actions absolute right-[clamp(1.25rem,4vw,2.5rem)] top-[clamp(1.25rem,4vw,2.5rem)] z-1">
          <slot name="actions" />
        </div>

        <div class="auth-entry-shell__brand flex items-center gap-3.5" :class="{ 'pr-44': $slots.actions }">
          <div class="auth-entry-shell__brand-mark flex h-12 w-12 shrink-0 items-center justify-center rounded-[1rem]">
            <img
              src="/app-icon.png"
              alt=""
              aria-hidden="true"
              class="auth-entry-shell__brand-mark-image block h-11 w-11 rounded-[0.875rem] object-cover"
            >
          </div>
          <div class="auth-entry-shell__brand-text min-w-0">
            <div class="auth-entry-shell__brand-name text-lg font-bold whitespace-nowrap text-main">
              Lexora
            </div>
          </div>
        </div>

        <header class="auth-entry-shell__header flex flex-col gap-3.5">
          <h1 class="auth-entry-shell__title m-0 text-[2.75rem] font-bold leading-[1.05] text-main max-sm:text-[2rem]">
            {{ props.title }}
          </h1>
          <p v-if="props.description" class="auth-entry-shell__description m-0 text-[15px] leading-[1.75] text-secondary">
            {{ props.description }}
          </p>
        </header>

        <div class="auth-entry-shell__body flex flex-col gap-4">
          <slot />
        </div>

        <footer class="auth-entry-shell__footer flex flex-wrap items-center gap-1.5 pt-1 text-sm text-secondary">
          <slot name="footer" />
        </footer>
      </section>
    </ElCard>
  </div>
</template>

<style scoped lang="scss">
.auth-entry-shell {
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--brand-primary) 14%, transparent), transparent 34%),
    radial-gradient(circle at bottom right, color-mix(in srgb, var(--brand-warning) 14%, transparent), transparent 26%),
    linear-gradient(180deg, color-mix(in srgb, var(--brand-bg-sidebar) 82%, white 18%), var(--brand-bg-sidebar));

  &__backdrop {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
    filter: blur(72px);
    opacity: 0.55;
  }

  &__backdrop--top {
    top: 4rem;
    right: 2rem;
    width: 15rem;
    height: 15rem;
    background: color-mix(in srgb, var(--brand-primary) 20%, white);
  }

  &__backdrop--bottom {
    bottom: 2rem;
    left: 3rem;
    width: 11rem;
    height: 11rem;
    background: color-mix(in srgb, var(--brand-warning) 18%, white);
  }

  &__card {
    border-color: color-mix(in srgb, var(--brand-border-base) 72%, transparent);
    box-shadow: 0 32px 88px -56px color-mix(in srgb, var(--brand-primary) 28%, transparent);
  }

  &__panel {
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--brand-bg-surface) 96%, white 4%), var(--brand-bg-surface));
  }

  &__footer:empty {
    display: none;
  }
}
</style>
