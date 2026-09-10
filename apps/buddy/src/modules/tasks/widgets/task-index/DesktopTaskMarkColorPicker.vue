<script setup lang="ts">
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { TASK_MARK_COLORS } from '@buddy-shared/conversation/taskMarkApi'
import { ChevronDown16Regular, Color20Regular } from '@vicons/fluent'
import { NButton, NColorPicker, NPopover } from 'naive-ui'
import { nextTick, shallowRef, useTemplateRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopColorPalette from '@/shared/ui/color-picker/DesktopColorPalette.vue'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import { buddyColorThemes } from '@/theme/buddyTheme'

const props = defineProps<{ disabled?: boolean, readonly?: boolean, language: BuddyLocale }>()
const color = defineModel<string>({ required: true })
const { t } = useBuddyI18n(() => props.language)
const open = shallowRef(false)
const trigger = useTemplateRef('trigger')
const panel = useTemplateRef('panel')
const options = [TASK_MARK_COLORS[0], ...Object.values(buddyColorThemes.light.spaceIcon)].map(value => ({ value, color: value }))

watch(open, async (value) => {
  if (value) {
    await nextTick()
    if (open.value)
      panel.value?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus()
  }
})
watch(() => props.disabled || props.readonly, (disabled) => {
  if (disabled)
    open.value = false
})

function close() {
  open.value = false
  trigger.value?.$el.focus()
}

function select(value: string) {
  color.value = value
  close()
}

function updateCustom(value: string | null) {
  if (value)
    color.value = value.toLowerCase()
}

function handleCustomEnter(event: KeyboardEvent) {
  if (event.target instanceof HTMLInputElement) {
    event.preventDefault()
    event.stopPropagation()
  }
}
</script>

<template>
  <span v-if="readonly" class="desktop-task-mark-color-picker__readonly" :style="{ backgroundColor: color }" />
  <NPopover v-else v-model:show="open" :disabled="disabled" :show-arrow="false" placement="bottom-start" trigger="click" :to="false">
    <template #trigger>
      <NButton ref="trigger" class="desktop-task-mark-color-picker__trigger" :disabled="disabled" :aria-expanded="open" aria-haspopup="dialog" @keydown.esc.stop.prevent="close">
        <span class="desktop-task-mark-color-picker__preview" :style="{ backgroundColor: color }" />
        <span class="desktop-task-mark-color-picker__value">{{ color }}</span>
        <DesktopIcon :component="ChevronDown16Regular" :size="14" />
      </NButton>
    </template>
    <section ref="panel" class="desktop-task-mark-color-picker" role="dialog" @keydown.esc.stop.prevent="close">
      <DesktopColorPalette :model-value="color" :options="options" :disabled="disabled" @update:model-value="select" />
      <div class="desktop-task-mark-color-picker__footer" @keydown.enter="handleCustomEnter">
        <NColorPicker :value="color" :modes="['hex']" :show-alpha="false" :actions="['confirm']" :disabled="disabled" :to="false" @update:value="updateCustom" @confirm="close">
          <template #trigger="{ onClick, ref: setTriggerRef }">
            <NButton :ref="setTriggerRef" class="desktop-task-mark-color-picker__custom" size="small" quaternary :disabled="disabled" @click="onClick">
              <template #icon>
                <DesktopIcon :component="Color20Regular" />
              </template>
              {{ t('desktop.marks.customColor') }}
            </NButton>
          </template>
        </NColorPicker>
      </div>
    </section>
  </NPopover>
</template>

<style scoped>
.desktop-task-mark-color-picker {
  width: 246px;
}

.desktop-task-mark-color-picker__trigger {
  gap: 8px;
}

.desktop-task-mark-color-picker__trigger :deep(.n-button__content) {
  gap: 8px;
}

.desktop-task-mark-color-picker__preview,
.desktop-task-mark-color-picker__readonly {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 6px;
}

.desktop-task-mark-color-picker__value {
  font-family: var(--buddy-font-mono);
  font-size: 12px;
}

.desktop-task-mark-color-picker__footer {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--buddy-border-subtle);
}

.desktop-task-mark-color-picker__custom {
  width: 100%;
  justify-content: flex-start;
}
</style>
