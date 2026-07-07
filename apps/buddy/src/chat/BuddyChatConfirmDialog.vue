<script setup lang="ts">
import { Delete16Regular, Dismiss16Regular } from '@vicons/fluent'
import { NIcon } from 'naive-ui'

defineProps<{
  cancelLabel: string
  confirmLabel: string
  message: string
  show: boolean
  title: string
}>()

const emit = defineEmits<{
  cancel: []
  confirm: []
}>()
</script>

<template>
  <Teleport to="body">
    <Transition name="buddy-chat-confirm-fade">
      <div
        v-if="show"
        class="buddy-chat-confirm"
        role="presentation"
        @click.self="emit('cancel')"
      >
        <section
          aria-modal="true"
          class="buddy-chat-confirm__panel"
          role="dialog"
        >
          <header class="buddy-chat-confirm__header">
            <span class="buddy-chat-confirm__mark">
              <NIcon :component="Delete16Regular" />
            </span>
            <div>
              <h2>{{ title }}</h2>
              <p>{{ message }}</p>
            </div>
          </header>

          <footer class="buddy-chat-confirm__actions">
            <button
              class="buddy-chat-confirm__button"
              type="button"
              @click="emit('cancel')"
            >
              <NIcon :component="Dismiss16Regular" />
              <span>{{ cancelLabel }}</span>
            </button>
            <button
              class="buddy-chat-confirm__button is-danger"
              type="button"
              @click="emit('confirm')"
            >
              <NIcon :component="Delete16Regular" />
              <span>{{ confirmLabel }}</span>
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.buddy-chat-confirm {
  position: fixed;
  z-index: 100;
  inset: 0;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at 50% 42%, rgb(248 242 225 / 18%) 0 180px, transparent 360px),
    rgb(8 18 34 / 38%);
  padding: 24px;
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
}

.buddy-chat-confirm__panel {
  width: min(360px, calc(100vw - 48px));
  border: 1px solid rgb(197 168 106 / 38%);
  border-radius: 8px;
  background:
    radial-gradient(circle at 16% 0%, rgb(141 193 209 / 20%) 0 72px, transparent 140px),
    linear-gradient(180deg, rgb(255 253 246 / 96%) 0%, rgb(244 250 247 / 94%) 100%);
  box-shadow:
    0 24px 70px rgb(7 19 43 / 28%),
    inset 0 1px 0 rgb(255 255 255 / 84%);
  color: var(--buddy-text-primary);
  padding: 18px;
}

.buddy-chat-confirm__header {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.buddy-chat-confirm__mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--buddy-accent-danger) 12%, white);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--buddy-accent-danger) 28%, transparent);
  color: color-mix(in srgb, var(--buddy-accent-danger) 82%, var(--buddy-text-primary));
}

.buddy-chat-confirm__header h2 {
  margin: 1px 0 6px;
  font-size: 16px;
  font-weight: 650;
  letter-spacing: 0;
  line-height: 1.35;
}

.buddy-chat-confirm__header p {
  margin: 0;
  color: var(--buddy-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.buddy-chat-confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

.buddy-chat-confirm__button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  border: 1px solid rgb(197 168 106 / 30%);
  border-radius: 8px;
  background: rgb(255 255 255 / 58%);
  color: var(--buddy-text-primary);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  outline: none;
  padding: 0 11px;
}

.buddy-chat-confirm__button:hover,
.buddy-chat-confirm__button:focus-visible {
  border-color: rgb(91 176 211 / 42%);
  background: rgb(255 255 255 / 82%);
}

.buddy-chat-confirm__button.is-danger {
  border-color: color-mix(in srgb, var(--buddy-accent-danger) 42%, transparent);
  background: color-mix(in srgb, var(--buddy-accent-danger) 12%, white);
  color: color-mix(in srgb, var(--buddy-accent-danger) 84%, var(--buddy-text-primary));
}

.buddy-chat-confirm-fade-enter-active,
.buddy-chat-confirm-fade-leave-active {
  transition: opacity 0.16s ease;
}

.buddy-chat-confirm-fade-enter-active .buddy-chat-confirm__panel,
.buddy-chat-confirm-fade-leave-active .buddy-chat-confirm__panel {
  transition: transform 0.16s ease;
}

.buddy-chat-confirm-fade-enter-from,
.buddy-chat-confirm-fade-leave-to {
  opacity: 0;
}

.buddy-chat-confirm-fade-enter-from .buddy-chat-confirm__panel,
.buddy-chat-confirm-fade-leave-to .buddy-chat-confirm__panel {
  transform: translateY(6px) scale(0.98);
}
</style>
