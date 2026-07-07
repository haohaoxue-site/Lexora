<script setup lang="ts">
import type { BuddyPetStateView } from '@/pet/petStateView'

defineProps<{
  desktopReady: boolean
  state: BuddyPetStateView
}>()

const emit = defineEmits<{
  activate: []
}>()
</script>

<template>
  <aside class="buddy-pet flex flex-col items-center justify-center gap-6 border-r border-border-light bg-surface px-8 py-10">
    <button
      class="buddy-pet__body-button"
      type="button"
      :aria-label="state.actionLabel"
      @click="emit('activate')"
    >
      <div
        class="buddy-pet__body"
        :class="[`is-${state.mood}`, { 'is-awake': desktopReady }]"
        aria-hidden="true"
      >
        <div class="buddy-pet__ear buddy-pet__ear--left" />
        <div class="buddy-pet__ear buddy-pet__ear--right" />
        <div class="buddy-pet__face">
          <span class="buddy-pet__eye" />
          <span class="buddy-pet__eye" />
          <span class="buddy-pet__mouth" />
        </div>
      </div>
    </button>

    <div class="text-center">
      <p class="m-0 text-lg text-main font-semibold">
        Lexora
      </p>
      <p class="m-0 mt-2 text-sm text-secondary">
        {{ state.statusLabel }}
      </p>
      <button
        class="buddy-pet__shortcut"
        type="button"
        @click="emit('activate')"
      >
        {{ state.actionLabel }}
      </button>
      <p class="buddy-pet__runtime">
        {{ desktopReady ? '桌面端运行中' : '等待桌面端' }}
      </p>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.buddy-pet {
  min-height: 320px;
}

.buddy-pet__body-button {
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 0;
}

.buddy-pet__body-button:focus-visible {
  border-radius: 42px;
  outline: 2px solid var(--buddy-accent-primary);
  outline-offset: 6px;
}

.buddy-pet__body {
  position: relative;
  width: 168px;
  aspect-ratio: 1;
  border: 1px solid color-mix(in srgb, var(--buddy-accent-primary) 32%, var(--buddy-border-base));
  border-radius: 40px;
  background:
    radial-gradient(circle at 32% 24%, color-mix(in srgb, var(--buddy-accent-warning) 28%, transparent), transparent 26%),
    linear-gradient(145deg, var(--buddy-bg-surface-raised), color-mix(in srgb, var(--buddy-accent-primary) 16%, var(--buddy-bg-surface)));
  box-shadow: var(--buddy-shadow-raised);
}

.buddy-pet__body.is-awake {
  border-color: color-mix(in srgb, var(--buddy-accent-success) 46%, var(--buddy-border-base));
}

.buddy-pet__body.is-thinking {
  animation: buddy-pet-breathe 1.6s ease-in-out infinite;
  border-color: color-mix(in srgb, var(--buddy-accent-warning) 54%, var(--buddy-border-base));
}

.buddy-pet__body.is-done {
  border-color: color-mix(in srgb, var(--buddy-accent-success) 58%, var(--buddy-border-base));
}

.buddy-pet__body.is-error {
  border-color: color-mix(in srgb, var(--buddy-accent-danger) 58%, var(--buddy-border-base));
}

.buddy-pet__ear {
  position: absolute;
  top: -14px;
  width: 48px;
  height: 48px;
  border: 1px solid var(--buddy-border-light);
  border-radius: 16px;
  background: var(--buddy-bg-surface-raised);
}

.buddy-pet__ear--left {
  left: 22px;
  transform: rotate(-16deg);
}

.buddy-pet__ear--right {
  right: 22px;
  transform: rotate(16deg);
}

.buddy-pet__face {
  position: absolute;
  inset: 46px 34px 34px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 32px;
  align-items: center;
  justify-items: center;
}

.buddy-pet__eye {
  width: 18px;
  height: 24px;
  border-radius: 50%;
  background: var(--buddy-text-primary);
}

.buddy-pet__mouth {
  grid-column: 1 / -1;
  width: 38px;
  height: 18px;
  border-bottom: 3px solid var(--buddy-text-regular);
  border-radius: 0 0 50% 50%;
}

.buddy-pet__body.is-thinking .buddy-pet__mouth {
  width: 28px;
}

.buddy-pet__body.is-done .buddy-pet__mouth {
  width: 46px;
  height: 22px;
}

.buddy-pet__body.is-error .buddy-pet__eye {
  height: 8px;
  border-radius: 8px;
}

.buddy-pet__shortcut {
  margin-top: 16px;
  border: 1px solid var(--buddy-border-base);
  border-radius: 8px;
  background: var(--buddy-bg-surface-raised);
  color: var(--buddy-text-primary);
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  line-height: 1;
  padding: 10px 14px;
}

.buddy-pet__runtime {
  margin: 12px 0 0;
  color: var(--buddy-text-placeholder);
  font-size: 12px;
  line-height: 1.5;
}

@keyframes buddy-pet-breathe {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-6px);
  }
}
</style>
