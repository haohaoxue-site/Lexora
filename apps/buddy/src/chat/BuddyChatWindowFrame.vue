<script setup lang="ts">
import type { BuddyLocale } from '@/i18n/buddyI18n'
import {
  Dismiss20Regular,
  Pin20Filled,
  Pin20Regular,
  Subtract20Regular,
} from '@vicons/fluent'
import { NIcon } from 'naive-ui'
import { computed, onMounted } from 'vue'
import { useBuddyWindowFrame } from '@/chat/useBuddyWindowFrame'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  language: BuddyLocale
  title: string
}>()

const emit = defineEmits<{
  avatarClick: []
}>()

const appIconUrl = new URL('../../src-tauri/icons/128x128.png', import.meta.url).href

const {
  hide,
  isPinned,
  minimize,
  refreshWindowState,
  startDragging,
  togglePin,
} = useBuddyWindowFrame()

const { t } = useBuddyI18n(() => props.language)

const pinLabel = computed(() => isPinned.value ? t('window.unpin') : t('window.pin'))

onMounted(() => {
  void refreshWindowState()
})

function dragWindow(event: MouseEvent) {
  if (event.button !== 0)
    return

  void startDragging()
}
</script>

<template>
  <section class="buddy-chat-frame">
    <header
      data-tauri-drag-region
      class="buddy-chat-frame__titlebar"
      @mousedown="dragWindow"
    >
      <div
        data-tauri-drag-region
        class="buddy-chat-frame__identity"
      >
        <button
          class="buddy-chat-frame__identity-button"
          type="button"
          @click.stop="emit('avatarClick')"
          @dblclick.stop
          @mousedown.stop
          @pointerdown.stop
        >
          <img
            class="buddy-chat-frame__app-icon"
            :src="appIconUrl"
            alt=""
            draggable="false"
          >
        </button>
        <div class="buddy-chat-frame__title-text">
          <strong>{{ title }}</strong>
        </div>
      </div>

      <div
        class="buddy-chat-frame__controls"
        @dblclick.stop
        @mousedown.stop
        @pointerdown.stop
      >
        <button
          :aria-label="pinLabel"
          :aria-pressed="isPinned"
          class="buddy-chat-frame__control"
          :class="{ 'is-pinned': isPinned }"
          type="button"
          @click="togglePin"
        >
          <NIcon :component="isPinned ? Pin20Filled : Pin20Regular" />
        </button>
        <button
          :aria-label="t('window.minimize')"
          class="buddy-chat-frame__control"
          type="button"
          @click="minimize"
        >
          <NIcon :component="Subtract20Regular" />
        </button>
        <button
          :aria-label="t('window.close')"
          class="buddy-chat-frame__control is-close"
          type="button"
          @click="hide"
        >
          <NIcon :component="Dismiss20Regular" />
        </button>
      </div>
    </header>

    <div class="buddy-chat-frame__content">
      <slot />
    </div>
  </section>
</template>

<style scoped lang="scss">
@property --buddy-chat-frame-avatar-ring-progress {
  syntax: "<angle>";
  inherits: false;
  initial-value: 0deg;
}

.buddy-chat-frame {
  display: grid;
  grid-template-rows: 48px minmax(0, 1fr);
  min-width: 0;
  height: 100vh;
  min-height: 0;
  overflow: hidden;
  border-radius: 4px;
  background: var(--buddy-bg-surface);
  color: var(--buddy-text-primary);
}

.buddy-chat-frame__titlebar {
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  overflow: hidden;
  border-bottom: 1px solid rgb(232 190 109 / 48%);
  background: rgb(7 19 43);
  user-select: none;
  -webkit-app-region: drag;
  padding: 0 8px 0 9px;
}

.buddy-chat-frame__titlebar::before,
.buddy-chat-frame__titlebar::after {
  position: absolute;
  inset: 0;
  content: "";
  pointer-events: none;
}

.buddy-chat-frame__titlebar::before {
  z-index: -2;
  background: url('../assets/window/chat-header.webp') center / cover no-repeat;
  filter: brightness(1.16) saturate(1.12) contrast(1.04);
}

.buddy-chat-frame__titlebar::after {
  z-index: -1;
  background:
    linear-gradient(
      90deg,
      rgb(5 15 35 / 90%) 0%,
      rgb(5 15 35 / 78%) 16%,
      rgb(5 15 35 / 34%) 30%,
      rgb(5 15 35 / 0%) 48%,
      rgb(5 15 35 / 0%) 66%,
      rgb(5 15 35 / 62%) 84%,
      rgb(5 15 35 / 92%) 100%
    ),
    linear-gradient(180deg, rgb(255 255 255 / 7%) 0%, rgb(0 0 0 / 9%) 100%);
}

.buddy-chat-frame__identity {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 8px;
}

.buddy-chat-frame__identity-button {
  --buddy-chat-frame-avatar-hover-ring: rgb(255 234 186 / 72%);
  --buddy-chat-frame-avatar-ring-progress: 0deg;

  position: relative;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  isolation: isolate;
  -webkit-app-region: no-drag;
  outline: none;
  padding: 0;
}

.buddy-chat-frame__identity-button::before {
  position: absolute;
  z-index: 2;
  inset: 1px;
  border-radius: inherit;
  background: conic-gradient(
    from -45deg,
    var(--buddy-chat-frame-avatar-hover-ring) 0deg,
    var(--buddy-chat-frame-avatar-hover-ring) var(--buddy-chat-frame-avatar-ring-progress),
    rgb(255 234 186 / 0%) var(--buddy-chat-frame-avatar-ring-progress),
    rgb(255 234 186 / 0%) 360deg
  );
  content: "";
  opacity: 0;
  padding: 1px;
  pointer-events: none;
  mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  mask-composite: exclude;
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
}

.buddy-chat-frame__app-icon {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid rgb(255 229 175 / 44%);
  border-radius: 8px;
  object-fit: cover;
}

.buddy-chat-frame__identity-button:hover::before,
.buddy-chat-frame__identity-button:focus-visible::before {
  animation: buddy-chat-frame-avatar-ring-flow 0.56s linear forwards;
  opacity: 1;
}

@keyframes buddy-chat-frame-avatar-ring-flow {
  from {
    --buddy-chat-frame-avatar-ring-progress: 0deg;
  }

  to {
    --buddy-chat-frame-avatar-ring-progress: 360deg;
  }
}

.buddy-chat-frame__title-text {
  min-width: 0;
  line-height: 1;
}

.buddy-chat-frame__title-text strong {
  overflow: hidden;
  color: rgb(255 250 239 / 90%);
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: 0;
  text-shadow: 0 1px 1px rgb(0 0 0 / 42%);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-chat-frame__controls {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(3, 26px);
  align-items: center;
  justify-content: end;
  gap: 4px;
  -webkit-app-region: no-drag;
}

.buddy-chat-frame__control {
  display: grid;
  place-items: center;
  width: 26px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: rgb(255 250 239 / 84%);
  cursor: pointer;
  padding: 0;
}

.buddy-chat-frame__control:hover {
  background: rgb(255 255 255 / 12%);
  color: rgb(255 255 255 / 96%);
}

.buddy-chat-frame__control.is-pinned {
  background: rgb(232 190 109 / 18%);
  color: rgb(255 218 139 / 96%);
}

.buddy-chat-frame__control.is-pinned:hover {
  background: rgb(232 190 109 / 24%);
}

.buddy-chat-frame__control.is-close:hover {
  background: rgb(200 82 82 / 34%);
  color: #ffffff;
}

.buddy-chat-frame__control :deep(svg) {
  width: 13px;
  height: 13px;
}

.buddy-chat-frame__content {
  grid-row: 2;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>
