<script setup lang="ts">
import type { SelectOption } from 'naive-ui'
import type { Component } from 'vue'
import { MoreHorizontal16Regular } from '@vicons/fluent'
import { NIcon, NPopselect } from 'naive-ui'
import { computed, h } from 'vue'

export interface BuddyChatHistoryActionMenuItem {
  key: string
  label: string
  disabled?: boolean
  icon?: Component
  tone?: 'danger' | 'default'
}

type BuddyActionSelectOption = SelectOption & {
  icon?: Component
}

const props = defineProps<{
  items: ReadonlyArray<BuddyChatHistoryActionMenuItem>
  label: string
}>()

const emit = defineEmits<{
  select: [key: string]
}>()

const options = computed<BuddyActionSelectOption[]>(() =>
  props.items.map(item => ({
    class: item.tone === 'danger' ? 'buddy-history-action-menu-option is-danger' : 'buddy-history-action-menu-option',
    disabled: item.disabled,
    icon: item.icon,
    label: item.label,
    value: item.key,
  })),
)

function renderMenuLabel(option: SelectOption) {
  const actionOption = option as BuddyActionSelectOption

  return h(
    'span',
    { class: 'buddy-history-action-menu-option__inner' },
    [
      actionOption.icon ? h(NIcon, { component: actionOption.icon }) : null,
      h('span', String(actionOption.label ?? '')),
    ],
  )
}

function handleSelect(value: string | number) {
  emit('select', String(value))
}
</script>

<template>
  <span class="buddy-history-action-menu">
    <NPopselect
      :options="options"
      :render-label="renderMenuLabel"
      :show-checkmark="false"
      :value="null"
      content-class="buddy-history-action-menu-popover"
      placement="bottom-end"
      size="small"
      to="body"
      trigger="click"
      @update:value="handleSelect"
    >
      <button
        class="buddy-history-action-menu__button"
        type="button"
        :aria-label="props.label"
        @click.stop
      >
        <NIcon :component="MoreHorizontal16Regular" />
      </button>
    </NPopselect>
  </span>
</template>

<style scoped lang="scss">
.buddy-history-action-menu {
  display: inline-grid;
  place-items: center;
}

.buddy-history-action-menu__button {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  box-shadow: none;
  color: color-mix(in srgb, var(--buddy-text-secondary) 82%, var(--buddy-text-primary));
  cursor: pointer;
  font-size: 16px;
  outline: none;
  padding: 0;
  transition:
    background-color 0.16s ease,
    box-shadow 0.16s ease,
    color 0.16s ease;
}

.buddy-history-action-menu__button:hover,
.buddy-history-action-menu__button:focus-visible {
  background: rgb(255 255 255 / 48%);
  box-shadow: none;
  color: color-mix(in srgb, var(--buddy-accent-primary) 74%, var(--buddy-text-primary));
}
</style>

<style lang="scss">
.buddy-history-action-menu-popover {
  border: 1px solid rgb(197 168 106 / 34%);
  background:
    linear-gradient(180deg, rgb(255 253 246 / 96%) 0%, rgb(244 250 247 / 94%) 100%);
  box-shadow:
    0 14px 34px rgb(7 19 43 / 18%),
    inset 0 1px 0 rgb(255 255 255 / 82%);
  backdrop-filter: blur(18px) saturate(1.08);
  -webkit-backdrop-filter: blur(18px) saturate(1.08);
}

.buddy-history-action-menu-option__inner {
  display: inline-grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.buddy-history-action-menu-option.is-danger {
  color: color-mix(in srgb, var(--buddy-accent-danger) 82%, var(--buddy-text-primary));
}
</style>
