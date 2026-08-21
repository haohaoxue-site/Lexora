<script setup lang="ts">
import type {
  LocalProvider,
  LocalRuntimeModelOption,
} from '@buddy-electron/shared/localChatApi'
import type {
  BuddyServiceTier,
  BuddyThinkingLevel,
} from '@buddy-shared/modelSelection'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { BUDDY_FAST_SERVICE_TIER } from '@buddy-shared/modelSelection'
import {
  ChevronRight16Regular,
  DismissCircle16Filled,
  Flash20Filled,
} from '@vicons/fluent'
import { useEventListener } from '@vueuse/core'
import { NIcon, NSwitch } from 'naive-ui'
import { computed, shallowRef, useTemplateRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopModelPicker from '@/ui/model-selector/DesktopModelPicker.vue'
import DesktopReasoningPicker from '@/ui/model-selector/DesktopReasoningPicker.vue'

interface ReasoningSelectorOption {
  label: string
  value: BuddyThinkingLevel
}

const props = withDefaults(defineProps<{
  clearable?: boolean
  disabled: boolean
  language: BuddyLocale
  models: ReadonlyArray<LocalRuntimeModelOption>
  placement?: 'bottom-start' | 'top-end'
  placeholder?: string
  providers: ReadonlyArray<LocalProvider>
  selectedEffort: BuddyThinkingLevel | null
  selectedModel: LocalRuntimeModelOption | null
  selectedModelId: string | null
  selectedServiceTier: BuddyServiceTier | null
  showFastMode?: boolean
  surface?: 'compact' | 'field'
}>(), {
  clearable: false,
  placement: 'top-end',
  placeholder: undefined,
  showFastMode: true,
  surface: 'compact',
})

const emit = defineEmits<{
  clearModel: []
  updateEffort: [value: BuddyThinkingLevel | null]
  updateModel: [value: string]
  updateServiceTier: [value: BuddyServiceTier | null]
}>()

const { t } = useBuddyI18n(() => props.language)
const root = useTemplateRef<HTMLElement>('root')
const isOpen = shallowRef(false)
const activePanel = shallowRef<'main' | 'model' | 'reasoning'>('main')
const canClearModel = computed(() => (
  props.clearable
  && props.selectedModelId !== null
  && !props.disabled
))
const canOpen = computed(() => !props.disabled && props.models.length > 0)

const reasoningLevelOptions = computed<ReadonlyArray<ReasoningSelectorOption>>(() => {
  const model = props.selectedModel
  if (!model)
    return []

  return model.reasoningOptions
    .filter(option => option !== 'off')
    .map(option => ({
      label: formatReasoningLabel(option),
      value: option,
    }))
})
const hasReasoningOptions = computed(() => Boolean(props.selectedModel?.reasoningOptions.length))
const canDisableReasoning = computed(() => props.selectedModel?.reasoningOptions.includes('off') ?? false)
const supportsFastMode = computed(() => props.showFastMode && Boolean(
  props.selectedModel?.serviceTiers.some(option => option.id === BUDDY_FAST_SERVICE_TIER),
))

const selectedEffortLabel = computed(() => {
  if (!hasReasoningOptions.value)
    return ''

  return props.selectedEffort
    ? formatReasoningLabel(props.selectedEffort)
    : t('desktop.chat.defaultEffort')
})

const isFastMode = computed(() => supportsFastMode.value
  && props.selectedServiceTier === BUDDY_FAST_SERVICE_TIER)

useEventListener(document, 'pointerdown', handleDocumentPointerDown)
useEventListener(document, 'keydown', handleDocumentKeydown)

function toggle() {
  if (!canOpen.value)
    return

  isOpen.value = !isOpen.value
  activePanel.value = 'main'
}

function close() {
  isOpen.value = false
  activePanel.value = 'main'
}

function selectEffort(value: BuddyThinkingLevel | null) {
  emit('updateEffort', value)
  close()
}

function selectModel(modelId: string) {
  emit('updateModel', modelId)
  activePanel.value = 'main'
}

function clearModel() {
  emit('clearModel')
  close()
}

function toggleFastMode(enabled: boolean) {
  emit('updateServiceTier', enabled ? BUDDY_FAST_SERVICE_TIER : null)
  close()
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!isOpen.value || !(event.target instanceof Node) || root.value?.contains(event.target))
    return

  close()
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape')
    close()
}

function formatOptionLabel(value: string) {
  const normalized = value.trim()
  if (!normalized)
    return ''

  return `${normalized.slice(0, 1).toUpperCase()}${normalized.slice(1)}`
}

function formatReasoningLabel(value: BuddyThinkingLevel) {
  return value === 'off' ? t('desktop.chat.reasoningOff') : formatOptionLabel(value)
}
</script>

<template>
  <div ref="root" class="desktop-model-selector">
    <div
      class="desktop-model-selector__control"
      :class="{ 'is-clearable': canClearModel }"
    >
      <button
        class="desktop-model-selector__trigger"
        :class="[`is-${surface}`, { 'is-fast': isFastMode }]"
        type="button"
        aria-haspopup="menu"
        :aria-expanded="isOpen"
        :disabled="!canOpen"
        @click="toggle"
      >
        <NIcon v-if="isFastMode" class="desktop-model-selector__flash" :component="Flash20Filled" />
        <span class="desktop-model-selector__model">
          {{ selectedModel?.displayName ?? placeholder ?? t('desktop.chat.noModels') }}
        </span>
        <span v-if="selectedEffortLabel" class="desktop-model-selector__separator">·</span>
        <span v-if="selectedEffortLabel" class="desktop-model-selector__effort">
          {{ selectedEffortLabel }}
        </span>
      </button>
      <button
        v-if="canClearModel"
        class="desktop-model-selector__clear"
        type="button"
        :aria-label="t('desktop.providers.clearDefaultModel')"
        @click="clearModel"
      >
        <NIcon :component="DismissCircle16Filled" />
      </button>
    </div>

    <div
      v-if="isOpen"
      class="desktop-model-selector__popover"
      :class="`is-${placement}`"
      @pointerdown.stop
    >
      <section class="desktop-model-selector__menu desktop-model-selector__menu--main" role="menu">
        <div v-if="supportsFastMode" class="desktop-model-selector__fast-row">
          <span class="desktop-model-selector__fast-copy">
            <NIcon class="desktop-model-selector__flash" :component="Flash20Filled" />
            <strong>{{ t('desktop.chat.fastMode') }}</strong>
          </span>
          <NSwitch
            size="small"
            :value="isFastMode"
            @update:value="toggleFastMode"
          />
        </div>
        <span v-if="supportsFastMode" class="desktop-model-selector__divider" />
        <template v-if="hasReasoningOptions">
          <button
            class="desktop-model-selector__item"
            :class="{ 'is-active': activePanel === 'reasoning' }"
            type="button"
            @click="activePanel = 'reasoning'"
          >
            <span class="desktop-model-selector__item-copy">
              <small>{{ t('desktop.chat.effort') }}</small>
              <strong>{{ selectedEffortLabel }}</strong>
            </span>
            <NIcon :component="ChevronRight16Regular" />
          </button>
          <span class="desktop-model-selector__divider" />
        </template>
        <button
          class="desktop-model-selector__item"
          :class="{ 'is-active': activePanel === 'model' }"
          type="button"
          @click="activePanel = 'model'"
        >
          <span class="desktop-model-selector__item-copy">
            <small>{{ t('desktop.chat.model') }}</small>
            <strong>{{ selectedModel?.displayName ?? placeholder ?? t('desktop.chat.noModels') }}</strong>
          </span>
          <NIcon :component="ChevronRight16Regular" />
        </button>
      </section>

      <DesktopReasoningPicker
        v-if="activePanel === 'reasoning'"
        :can-disable="canDisableReasoning"
        :language="language"
        :options="reasoningLevelOptions"
        :selected-effort="selectedEffort"
        @select="selectEffort"
      />

      <DesktopModelPicker
        v-else-if="activePanel === 'model'"
        :language="language"
        :models="models"
        :providers="providers"
        :selected-model-id="selectedModelId"
        @select="selectModel"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.desktop-model-selector {
  position: relative;
  min-width: 0;
}

.desktop-model-selector__control {
  position: relative;
  min-width: 0;

  &.is-clearable .desktop-model-selector__trigger {
    padding-right: 2rem;
  }

  &.is-clearable:hover,
  &.is-clearable:has(.desktop-model-selector__clear:focus-visible) {
    .desktop-model-selector__clear {
      opacity: 1;
      pointer-events: auto;
    }
  }
}

.desktop-model-selector__trigger {
  display: inline-flex;
  min-width: 0;
  max-width: min(22rem, 44vw);
  height: 2rem;
  align-items: center;
  gap: 0.35rem;
  border: 0;
  border-radius: 0.55rem;
  background: transparent;
  color: var(--buddy-text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 0.78rem;
  padding: 0 0.45rem 0 0.55rem;

  &:hover,
  &:focus-visible,
  &[aria-expanded='true'] {
    background: color-mix(in srgb, var(--buddy-accent-primary) 9%, transparent);
    color: var(--buddy-text-primary);
    outline: 0;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  &.is-fast {
    color: color-mix(in srgb, var(--buddy-accent-primary) 82%, var(--buddy-text-primary));
  }

  &.is-field {
    width: 100%;
    max-width: none;
    height: 2.25rem;
    border: 1px solid var(--buddy-border-light);
    border-radius: 0.5rem;
    background: var(--buddy-bg-surface-raised);
    padding-inline: 0.7rem 0.55rem;
  }
}

.desktop-model-selector__model {
  min-width: 0;
  overflow: hidden;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-model-selector__effort,
.desktop-model-selector__separator {
  flex: none;
  color: var(--buddy-text-placeholder);
}

.desktop-model-selector__flash,
.desktop-model-selector__item > :deep(.n-icon) {
  flex: none;
}

.desktop-model-selector__clear {
  position: absolute;
  top: 50%;
  right: 0.25rem;
  z-index: 1;
  display: grid;
  width: 1.5rem;
  height: 1.5rem;
  place-items: center;
  border: 0;
  border-radius: 0.375rem;
  background: transparent;
  color: var(--buddy-text-placeholder);
  cursor: pointer;
  opacity: 0;
  padding: 0;
  pointer-events: none;
  transform: translateY(-50%);
  transition: opacity 80ms ease;

  &:hover,
  &:focus-visible {
    background: var(--buddy-fill-base);
    color: var(--buddy-text-secondary);
    outline: 0;
  }

}

.desktop-model-selector__flash {
  color: color-mix(in srgb, #c99a2e 84%, var(--buddy-accent-primary));
}

.desktop-model-selector__popover {
  position: absolute;
  right: 0;
  bottom: calc(100% + 0.65rem);
  z-index: 32;
  display: flex;
  max-width: calc(100vw - 3rem);
  flex-direction: row-reverse;
  align-items: flex-end;
  gap: 0.5rem;

  &.is-bottom-start {
    top: calc(100% + 0.55rem);
    right: auto;
    bottom: auto;
    left: 0;
    flex-direction: row;
    align-items: flex-start;
  }
}

.desktop-model-selector__menu {
  display: grid;
  width: 13.5rem;
  gap: 0.15rem;
  overflow: hidden;
  border: 1px solid var(--buddy-border-light);
  border-radius: 0.8rem;
  background: color-mix(in srgb, var(--buddy-bg-surface-raised) 97%, transparent);
  box-shadow: 0 1rem 2.5rem rgb(23 33 28 / 16%);
  padding: 0.5rem;
}

.desktop-model-selector__divider {
  height: 1px;
  margin: 0.25rem 0.15rem;
  background: var(--buddy-border-light);
}

.desktop-model-selector__item {
  display: flex;
  min-width: 0;
  min-height: 2.15rem;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  border: 0;
  border-radius: 0.55rem;
  background: transparent;
  color: var(--buddy-text-primary);
  cursor: pointer;
  font: inherit;
  padding: 0.4rem 0.55rem;
  text-align: left;

  &:hover,
  &:focus-visible,
  &.is-active {
    background: var(--buddy-fill-base);
    outline: 0;
  }
}

.desktop-model-selector__item-copy {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 0.1rem;

  strong,
  small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-size: 0.78rem;
    font-weight: 650;
  }

  small {
    color: var(--buddy-text-placeholder);
    font-size: 0.68rem;
    line-height: 1.3;
  }
}

.desktop-model-selector__fast-row,
.desktop-model-selector__fast-copy {
  display: flex;
  min-width: 0;
  align-items: center;
}

.desktop-model-selector__fast-row {
  min-height: 2.15rem;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.35rem 0.55rem;
}

.desktop-model-selector__fast-copy {
  gap: 0.35rem;

  strong {
    font-size: 0.78rem;
    font-weight: 650;
  }
}

@media (max-width: 680px) {
  .desktop-model-selector__trigger {
    max-width: 50vw;
  }

  .desktop-model-selector__popover {
    max-width: calc(100vw - 1.5rem);
    overflow-x: auto;
  }
}
</style>
