<script setup lang="ts">
import type { DesktopChatWelcomePreference } from '@buddy-electron/shared/desktopApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { ChevronDown16Regular } from '@vicons/fluent'
import { NIcon, NPopover } from 'naive-ui'
import { computed, shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { DESKTOP_CHAT_WELCOME_VARIANTS } from '@/workbenches/chat/workspace/desktopChatWelcomeVariants'

const props = defineProps<{
  language: BuddyLocale
  pending: boolean
  value: DesktopChatWelcomePreference
}>()

const emit = defineEmits<{
  select: [value: DesktopChatWelcomePreference]
}>()

const { t } = useBuddyI18n(() => props.language)
const panelOpen = shallowRef(false)
const currentLabel = computed(() => {
  if (props.value === 'random')
    return t('desktop.settings.welcomeRandom')

  const variant = DESKTOP_CHAT_WELCOME_VARIANTS.find(item => item.id === props.value)
  return variant ? t(variant.titleKey) : t('desktop.settings.welcomeRandom')
})

function selectPreference(preference: DesktopChatWelcomePreference) {
  if (props.pending || preference === props.value)
    return
  emit('select', preference)
}
</script>

<template>
  <NPopover
    class="buddy-raw-popover"
    :show="panelOpen"
    trigger="click"
    placement="bottom-end"
    raw
    to=".buddy-app"
    :show-arrow="false"
    @update:show="panelOpen = $event"
  >
    <template #trigger>
      <button
        class="desktop-welcome-preference-picker__trigger"
        type="button"
        aria-haspopup="dialog"
        :aria-expanded="panelOpen"
      >
        <span>{{ currentLabel }}</span>
        <NIcon
          class="desktop-welcome-preference-picker__chevron"
          :class="{ 'is-open': panelOpen }"
          :component="ChevronDown16Regular"
        />
      </button>
    </template>

    <section
      class="desktop-welcome-preference-picker__panel"
      role="dialog"
      :aria-label="t('desktop.settings.welcome')"
    >
      <header class="desktop-welcome-preference-picker__header">
        <strong>{{ t('desktop.settings.welcome') }}</strong>
      </header>

      <button
        class="desktop-welcome-preference-picker__random"
        :class="{ 'is-selected': value === 'random' }"
        type="button"
        :aria-pressed="value === 'random'"
        :disabled="pending"
        @click="selectPreference('random')"
      >
        {{ t('desktop.settings.welcomeRandom') }}
      </button>

      <div class="desktop-welcome-preference-picker__specific">
        <strong>{{ t('desktop.settings.welcomeSpecific') }}</strong>
        <div class="desktop-welcome-preference-picker__options" role="group">
          <button
            v-for="variant in DESKTOP_CHAT_WELCOME_VARIANTS"
            :key="variant.id"
            class="desktop-welcome-preference-picker__option"
            :class="{ 'is-selected': value === variant.id }"
            type="button"
            :aria-pressed="value === variant.id"
            :disabled="pending"
            @click="selectPreference(variant.id)"
          >
            <img
              class="desktop-welcome-preference-picker__illustration"
              :src="variant.illustrationUrl"
              alt=""
              draggable="false"
            >
            <span>{{ t(variant.titleKey) }}</span>
          </button>
        </div>
      </div>
    </section>
  </NPopover>
</template>

<style scoped lang="scss">
.desktop-welcome-preference-picker__trigger {
  display: grid;
  width: 100%;
  min-width: 0;
  min-height: 2.35rem;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.65rem;
  border: 1px solid var(--buddy-border-base);
  border-radius: 0.25rem;
  background: var(--buddy-bg-surface-raised);
  color: var(--buddy-text-regular);
  padding: 0.35rem 0.65rem;
  font: inherit;
  font-size: 0.8rem;
  text-align: left;
  transition:
    border-color 100ms ease,
    box-shadow 100ms ease;

  > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &:hover {
    border-color: color-mix(in srgb, var(--buddy-accent-primary) 52%, var(--buddy-border-base));
  }

  &:focus-visible {
    border-color: var(--buddy-accent-primary);
    outline: 0;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--buddy-accent-primary) 18%, transparent);
  }
}

.desktop-welcome-preference-picker__chevron {
  color: var(--buddy-text-secondary);
  transition: transform 120ms ease;

  &.is-open {
    transform: rotate(180deg);
  }
}

.desktop-welcome-preference-picker__panel {
  width: min(34rem, calc(100vw - 2rem));
  overflow: hidden;
  border: 1px solid var(--buddy-border-light);
  border-radius: 0.65rem;
  background: var(--buddy-bg-surface-raised);
  box-shadow:
    0 0.25rem 0.7rem rgb(25 30 38 / 10%),
    0 1.1rem 2.6rem rgb(25 30 38 / 14%);
  padding: 0.8rem;
}

.desktop-welcome-preference-picker__header {
  display: flex;
  align-items: center;
  min-height: 1.8rem;
  color: var(--buddy-text-primary);

  strong {
    font-size: 0.82rem;
    font-weight: 600;
  }
}

.desktop-welcome-preference-picker__random {
  width: 100%;
  min-height: 2.55rem;
  border: 1px solid var(--buddy-border-light);
  border-radius: 0.45rem;
  background: var(--buddy-bg-surface);
  color: var(--buddy-text-regular);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  transition:
    background-color 100ms ease,
    border-color 100ms ease,
    box-shadow 100ms ease;

  &:not(:disabled) {
    cursor: pointer;
  }

  &:not(:disabled):hover {
    border-color: color-mix(in srgb, var(--buddy-accent-primary) 46%, var(--buddy-border-light));
    background: color-mix(in srgb, var(--buddy-accent-primary) 4%, var(--buddy-bg-surface));
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-accent-primary);
    outline-offset: 2px;
  }

  &.is-selected {
    border-color: color-mix(in srgb, var(--buddy-accent-primary) 72%, var(--buddy-border-light));
    background: color-mix(in srgb, var(--buddy-accent-primary) 7%, var(--buddy-bg-surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--buddy-accent-primary) 18%, transparent);
  }
}

.desktop-welcome-preference-picker__specific {
  display: grid;
  gap: 0.55rem;
  border-top: 1px solid var(--buddy-border-light);
  margin-top: 0.75rem;
  padding-top: 0.7rem;

  > strong {
    color: var(--buddy-text-secondary);
    font-size: 0.7rem;
    font-weight: 600;
  }
}

.desktop-welcome-preference-picker__options {
  display: flex;
  gap: 0.65rem;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  padding: 0.1rem 0.1rem 0.45rem;
  scroll-snap-type: inline proximity;
  scrollbar-color: var(--buddy-border-base) transparent;
  scrollbar-width: thin;
}

.desktop-welcome-preference-picker__option {
  display: grid;
  min-height: 10.75rem;
  flex: 0 0 9.75rem;
  grid-template-rows: 7.6rem minmax(2.25rem, auto);
  align-items: center;
  gap: 0.2rem;
  border: 1px solid var(--buddy-border-light);
  border-radius: 0.5rem;
  background: var(--buddy-bg-surface);
  color: var(--buddy-text-regular);
  padding: 0.35rem 0.5rem 0.55rem;
  scroll-snap-align: start;
  text-align: center;
  transition:
    background-color 100ms ease,
    border-color 100ms ease,
    box-shadow 100ms ease;

  &:not(:disabled) {
    cursor: pointer;
  }

  &:not(:disabled):hover {
    border-color: color-mix(in srgb, var(--buddy-accent-primary) 46%, var(--buddy-border-light));
    background: color-mix(in srgb, var(--buddy-accent-primary) 4%, var(--buddy-bg-surface));
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-accent-primary);
    outline-offset: 2px;
  }

  &.is-selected {
    border-color: color-mix(in srgb, var(--buddy-accent-primary) 72%, var(--buddy-border-light));
    background: color-mix(in srgb, var(--buddy-accent-primary) 7%, var(--buddy-bg-surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--buddy-accent-primary) 18%, transparent);
  }

  > span {
    overflow-wrap: anywhere;
    font-family: "Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", STSong, SimSun, serif;
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    line-height: 1.45;
  }
}

.desktop-welcome-preference-picker__illustration {
  width: 7.4rem;
  height: 7.4rem;
  place-self: center;
  object-fit: contain;
  user-select: none;
}
</style>
