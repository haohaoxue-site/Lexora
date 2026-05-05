<script setup lang="ts">
interface AuthEntryShellProps {
  title: string
  description?: string
}

const props = defineProps<AuthEntryShellProps>()
</script>

<template>
  <div class="auth-entry-shell">
    <div class="auth-entry-shell__backdrop auth-entry-shell__backdrop--top" aria-hidden="true" />
    <div class="auth-entry-shell__backdrop auth-entry-shell__backdrop--bottom" aria-hidden="true" />

    <ElCard shadow="never" body-class="!p-0" class="auth-entry-shell__card">
      <section class="auth-entry-shell__panel">
        <div class="auth-entry-shell__brand">
          <div class="auth-entry-shell__brand-mark">
            <SvgIcon category="nav" icon="workspace" size="2.25rem" />
          </div>
          <div class="auth-entry-shell__brand-copy">
            <div class="auth-entry-shell__brand-name">
              SamePage Docs
            </div>
            <div class="auth-entry-shell__brand-tagline">
              在线协作文档
            </div>
          </div>
        </div>

        <header class="auth-entry-shell__header">
          <h1 class="auth-entry-shell__title">
            {{ props.title }}
          </h1>
          <p v-if="props.description" class="auth-entry-shell__description">
            {{ props.description }}
          </p>
        </header>

        <div class="auth-entry-shell__body">
          <slot />
        </div>

        <footer class="auth-entry-shell__footer">
          <slot name="footer" />
        </footer>
      </section>
    </ElCard>
  </div>
</template>

<style scoped lang="scss">
.auth-entry-shell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: clamp(1.25rem, 4vw, 2rem);
  overflow: hidden;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--brand-primary) 14%, transparent), transparent 34%),
    radial-gradient(circle at bottom right, color-mix(in srgb, var(--brand-warning) 14%, transparent), transparent 26%),
    linear-gradient(180deg, color-mix(in srgb, var(--brand-bg-sidebar) 82%, white 18%), var(--brand-bg-sidebar));

  &__backdrop {
    position: absolute;
    border-radius: 9999px;
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
    position: relative;
    width: min(100%, 34rem);
    overflow: hidden;
    border-color: color-mix(in srgb, var(--brand-border-base) 72%, transparent);
    border-radius: 1.75rem;
    box-shadow: 0 32px 88px -56px color-mix(in srgb, var(--brand-primary) 28%, transparent);

    &::before,
    &::after {
      position: absolute;
      inset: auto;
      border-radius: 9999px;
      content: '';
      pointer-events: none;
    }

    &::before {
      top: -3.5rem;
      right: -2rem;
      width: 10rem;
      height: 10rem;
      background: radial-gradient(circle, color-mix(in srgb, var(--brand-primary) 16%, white), transparent 68%);
    }

    &::after {
      right: 1.5rem;
      bottom: -4rem;
      width: 8rem;
      height: 8rem;
      background: radial-gradient(circle, color-mix(in srgb, var(--brand-warning) 16%, white), transparent 70%);
    }
  }

  &__panel {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: clamp(1.5rem, 4vw, 2.5rem);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--brand-bg-surface) 96%, white 4%), var(--brand-bg-surface));
    backdrop-filter: blur(8px);
  }

  &__brand {
    display: flex;
    align-items: center;
    gap: 0.875rem;
  }

  &__brand-mark {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3rem;
    border-radius: 1rem;
    background: color-mix(in srgb, var(--brand-primary) 10%, transparent);
  }

  &__brand-copy {
    min-width: 0;
  }

  &__brand-name {
    color: var(--brand-text-primary);
    font-size: 1.125rem;
    font-weight: 700;
  }

  &__brand-tagline {
    margin-top: 0.25rem;
    color: var(--brand-text-secondary);
    font-size: 0.75rem;
  }

  &__header {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
  }

  &__title {
    margin: 0;
    color: var(--brand-text-primary);
    font-size: clamp(2rem, 5vw, 2.75rem);
    font-weight: 700;
    line-height: 1.05;
    letter-spacing: -0.04em;
  }

  &__description {
    margin: 0;
    color: var(--brand-text-secondary);
    font-size: 0.9375rem;
    line-height: 1.75;
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  &__footer {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.375rem;
    padding-top: 0.25rem;
    color: var(--brand-text-secondary);
    font-size: 0.875rem;

    &:empty {
      display: none;
    }
  }
}
</style>
