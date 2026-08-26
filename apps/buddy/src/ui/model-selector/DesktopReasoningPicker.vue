<script setup lang="ts">
import type { BuddyThinkingLevel } from '@buddy-shared/modelSelection'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { Checkmark16Regular } from '@vicons/fluent'
import { NIcon } from 'naive-ui'
import { useBuddyI18n } from '@/i18n/buddyI18n'

interface ReasoningOption {
  label: string
  value: BuddyThinkingLevel
}

const props = defineProps<{
  canDisable: boolean
  language: BuddyLocale
  options: ReadonlyArray<ReasoningOption>
  selectedEffort: BuddyThinkingLevel | null
}>()

const emit = defineEmits<{
  select: [value: BuddyThinkingLevel | null]
}>()

const { t } = useBuddyI18n(() => props.language)
</script>

<template>
  <section class="desktop-reasoning-picker" role="menu">
    <span class="desktop-reasoning-picker__title">{{ t('desktop.chat.effort') }}</span>
    <div class="desktop-reasoning-picker__options">
      <button
        class="desktop-reasoning-picker__item"
        type="button"
        role="menuitemradio"
        :aria-checked="selectedEffort === null"
        @click="emit('select', null)"
      >
        <strong>{{ t('desktop.chat.defaultEffort') }}</strong>
        <NIcon v-if="selectedEffort === null" :component="Checkmark16Regular" />
      </button>
      <span class="desktop-reasoning-picker__divider" />
      <button
        v-if="canDisable"
        class="desktop-reasoning-picker__item"
        type="button"
        role="menuitemradio"
        :aria-checked="selectedEffort === 'off'"
        @click="emit('select', 'off')"
      >
        <strong>{{ t('desktop.chat.reasoningOff') }}</strong>
        <NIcon v-if="selectedEffort === 'off'" :component="Checkmark16Regular" />
      </button>
      <span v-if="canDisable" class="desktop-reasoning-picker__divider" />
      <button
        v-for="option in options"
        :key="option.value"
        class="desktop-reasoning-picker__item"
        type="button"
        role="menuitemradio"
        :aria-checked="selectedEffort === option.value"
        @click="emit('select', option.value)"
      >
        <strong>{{ option.label }}</strong>
        <NIcon v-if="selectedEffort === option.value" :component="Checkmark16Regular" />
      </button>
    </div>
  </section>
</template>

<style scoped>
.desktop-reasoning-picker {
  display: grid;
  overflow: hidden;
  width: 13.5rem;
  max-height: min(24rem, 58vh);
  border: 1px solid var(--buddy-border-light);
  border-radius: var(--buddy-menu-radius);
  background: color-mix(in srgb, var(--buddy-bg-surface-raised) 97%, transparent);
  box-shadow: var(--buddy-shadow-menu);
}

.desktop-reasoning-picker__title {
  color: var(--buddy-text-placeholder);
  font-size: 0.7rem;
  line-height: 1.35;
  padding: 0.65rem 1.05rem 0.3rem;
}

.desktop-reasoning-picker__options {
  display: grid;
  min-height: 0;
  align-content: start;
  gap: 0.15rem;
  overflow: hidden auto;
  padding: 0 0.5rem 0.5rem;
}

.desktop-reasoning-picker__divider {
  height: 1px;
  margin: 0.25rem 0.15rem;
  background: var(--buddy-border-light);
}

.desktop-reasoning-picker__item {
  display: flex;
  min-width: 0;
  min-height: 2.15rem;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  border: 0;
  border-radius: var(--buddy-menu-item-radius);
  background: transparent;
  color: var(--buddy-text-primary);
  cursor: pointer;
  font: inherit;
  padding: 0.4rem 0.55rem;
  text-align: left;
}

.desktop-reasoning-picker__item:hover,
.desktop-reasoning-picker__item:focus-visible {
  background: var(--buddy-fill-base);
  outline: 0;
}

.desktop-reasoning-picker__item strong {
  overflow: hidden;
  min-width: 0;
  font-size: 0.78rem;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-reasoning-picker__item :deep(.n-icon) {
  flex: none;
}
</style>
