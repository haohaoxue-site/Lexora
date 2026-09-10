<script setup lang="ts">
import type { SpaceIcon, SpaceIconColor, SpaceLinearIcon } from '@buddy-shared/spaces/spaceAppearance'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { SPACE_FILLED_ICONS, SPACE_ICON_COLORS, SPACE_LINEAR_ICONS } from '@buddy-shared/spaces/spaceAppearance'
import { Checkmark16Regular } from '@vicons/fluent'
import { NButton, NPopover, NRadioButton, NRadioGroup } from 'naive-ui'
import { computed, nextTick, useTemplateRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import DesktopSpaceIcon from './DesktopSpaceIcon.vue'

const props = defineProps<{
  disabled?: boolean
  language: BuddyLocale
}>()
const icon = defineModel<SpaceIcon>('icon', { required: true })
const iconColor = defineModel<SpaceIconColor>('iconColor', { required: true })
const { t } = useBuddyI18n(() => props.language)
const open = defineModel<boolean>('show', { required: true })
const trigger = useTemplateRef('trigger')
const panel = useTemplateRef('panel')
const iconStyle = computed({
  get: () => icon.value.endsWith('-filled') ? 'filled' : 'linear',
  set: (style: 'linear' | 'filled') => {
    const linearIcon = icon.value.replace(/-filled$/, '') as SpaceLinearIcon
    icon.value = style === 'filled' ? `${linearIcon}-filled` : linearIcon
  },
})
const visibleIcons = computed(() => iconStyle.value === 'filled' ? SPACE_FILLED_ICONS : SPACE_LINEAR_ICONS)

watch(open, async (value) => {
  if (!value)
    return
  await nextTick()
  if (open.value)
    panel.value?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus()
})
watch(() => props.disabled, (disabled) => {
  if (disabled)
    open.value = false
})

function close() {
  open.value = false
  trigger.value?.$el.focus()
}

function reset() {
  icon.value = 'folder'
  iconColor.value = 'default'
}
</script>

<template>
  <NPopover
    v-model:show="open"
    :disabled="disabled"
    :show-arrow="false"
    placement="bottom-start"
    trigger="click"
    :to="false"
  >
    <template #trigger>
      <NButton
        ref="trigger"
        class="desktop-space-appearance-picker__trigger"
        :disabled="disabled"
        :aria-label="t('desktop.tasks.spaceAppearance')"
        :aria-expanded="open"
        aria-haspopup="dialog"
        @keydown.esc.stop.prevent="close"
      >
        <DesktopSpaceIcon :icon="icon" :icon-color="iconColor" :size="20" />
      </NButton>
    </template>
    <section
      ref="panel"
      class="desktop-space-appearance-picker"
      role="dialog"
      :aria-label="t('desktop.tasks.spaceAppearance')"
      @keydown.esc.stop.prevent="close"
    >
      <NRadioGroup v-model:value="iconStyle" class="desktop-space-appearance-picker__styles" :disabled="disabled" size="small">
        <NRadioButton class="desktop-space-appearance-picker__style" value="linear">
          {{ t('desktop.tasks.spaceIconLinear') }}
        </NRadioButton>
        <NRadioButton class="desktop-space-appearance-picker__style" value="filled">
          {{ t('desktop.tasks.spaceIconFilled') }}
        </NRadioButton>
      </NRadioGroup>
      <div class="desktop-space-appearance-picker__icons">
        <NButton
          v-for="value in visibleIcons"
          :key="value"
          class="desktop-space-appearance-picker__option"
          :class="{ 'is-selected': icon === value }"
          quaternary
          :disabled="disabled"
          :aria-label="value"
          :data-icon="value"
          :aria-pressed="icon === value"
          @click="icon = value"
        >
          <DesktopSpaceIcon :icon="value" :icon-color="iconColor" :size="20" />
        </NButton>
      </div>
      <div class="desktop-space-appearance-picker__colors">
        <button
          v-for="value in SPACE_ICON_COLORS"
          :key="value"
          class="desktop-space-appearance-picker__swatch"
          :class="{ 'is-selected': iconColor === value, 'is-default': value === 'default' }"
          :style="{ '--swatch-color': value === 'default' ? 'var(--buddy-text-secondary)' : `var(--buddy-space-icon-${value})` }"
          type="button"
          :disabled="disabled"
          :aria-label="value"
          :data-color="value"
          :aria-pressed="iconColor === value"
          @click="iconColor = value"
        >
          <DesktopIcon v-if="iconColor === value" class="desktop-space-appearance-picker__check" :component="Checkmark16Regular" :size="14" />
        </button>
      </div>
      <div class="desktop-space-appearance-picker__footer">
        <NButton size="tiny" quaternary :disabled="disabled" @click="reset">
          {{ t('desktop.tasks.spaceAppearanceReset') }}
        </NButton>
      </div>
    </section>
  </NPopover>
</template>

<style scoped>
.desktop-space-appearance-picker__trigger {
  width: var(--n-height);
  flex: none;
  padding: 0;
  border-radius: 6px;
}

.desktop-space-appearance-picker {
  width: 246px;
  color: var(--buddy-text-primary);
}

.desktop-space-appearance-picker__styles {
  display: flex;
  width: 100%;
  margin-bottom: 12px;
}

.desktop-space-appearance-picker__style {
  flex: 1;
  text-align: center;
}

.desktop-space-appearance-picker__icons {
  display: grid;
  grid-template-columns: repeat(6, 36px);
  gap: 6px;
  margin-bottom: 16px;
}

.desktop-space-appearance-picker__option {
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 6px;
  color: var(--buddy-text-secondary);
}

.desktop-space-appearance-picker__option.is-selected {
  box-shadow: inset 0 0 0 1px var(--buddy-accent-border);
  background: var(--buddy-accent-surface);
}

.desktop-space-appearance-picker__colors {
  display: grid;
  grid-auto-flow: column;
  grid-template-columns: repeat(9, 24px);
  grid-template-rows: repeat(3, 24px);
  justify-content: space-between;
  row-gap: 5px;
  padding-top: 16px;
  border-top: 1px solid var(--buddy-border-subtle);
}

.desktop-space-appearance-picker__swatch {
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

.desktop-space-appearance-picker__swatch.is-default {
  border-color: var(--buddy-border-strong);
  background: linear-gradient(135deg, var(--buddy-surface-raised) 47%, var(--buddy-text-secondary) 48%, var(--buddy-text-secondary) 52%, var(--buddy-surface-raised) 53%);
}

.desktop-space-appearance-picker__swatch:hover,
.desktop-space-appearance-picker__swatch.is-selected {
  box-shadow: 0 0 0 1px var(--buddy-surface-raised), 0 0 0 2px var(--swatch-color);
}

.desktop-space-appearance-picker__check {
  border-radius: 3px;
  background: var(--buddy-surface-raised);
  color: var(--buddy-text-strong);
}

.desktop-space-appearance-picker__swatch:focus-visible {
  outline: 2px solid var(--buddy-focus-ring);
  outline-offset: 2px;
}

.desktop-space-appearance-picker__footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--buddy-border-subtle);
}
</style>
