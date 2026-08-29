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
import { BUDDY_DEFAULT_THINKING_LEVEL, BUDDY_FAST_SERVICE_TIER } from '@buddy-shared/modelSelection'
import {
  ChevronLeft16Regular,
  ChevronRight16Regular,
  DismissCircle16Filled,
  Flash20Filled,
} from '@vicons/fluent'
import { useEventListener } from '@vueuse/core'
import { NIcon } from 'naive-ui'
import { computed, shallowRef, useTemplateRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopModelPicker from '@/ui/model-selector/DesktopModelPicker.vue'
import DesktopReasoningMeter from '@/ui/model-selector/DesktopReasoningMeter.vue'
import DesktopReasoningPicker from '@/ui/model-selector/DesktopReasoningPicker.vue'

interface ReasoningSelectorOption {
  label: string
  value: BuddyThinkingLevel
}

type EffortTransitionDirection = 'decreasing' | 'increasing'

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
const activePanel = shallowRef<'advanced' | 'main'>('main')
const secondaryPanel = shallowRef<'model' | 'reasoning' | null>(null)
const previewEffort = shallowRef<BuddyThinkingLevel | null>(null)
const isMeterDragging = shallowRef(false)
const effortTransitionDirection = shallowRef<EffortTransitionDirection>('increasing')
const canClearModel = computed(() => (
  props.clearable
  && props.selectedModelId !== null
  && !props.disabled
))
const canOpen = computed(() => !props.disabled && props.models.length > 0)
const reasoningLevelOptions = computed<ReadonlyArray<ReasoningSelectorOption>>(() => (
  props.selectedModel?.reasoningOptions.map(value => ({
    label: formatReasoningLabel(value),
    value,
  })) ?? []
))
const selectedEffortValue = computed<BuddyThinkingLevel | null>(() => {
  const options = props.selectedModel?.reasoningOptions ?? []
  if (props.selectedEffort && options.includes(props.selectedEffort))
    return props.selectedEffort
  if (options.includes(BUDDY_DEFAULT_THINKING_LEVEL))
    return BUDDY_DEFAULT_THINKING_LEVEL
  return options.find(level => level !== 'off') ?? options[0] ?? null
})
const displayedEffort = computed(() => previewEffort.value ?? selectedEffortValue.value)
const selectedEffortLabel = computed(() => selectedEffortValue.value
  ? formatReasoningLabel(selectedEffortValue.value)
  : '')
const displayedEffortLabel = computed(() => displayedEffort.value
  ? formatReasoningLabel(displayedEffort.value)
  : '')
const supportsFastMode = computed(() => props.showFastMode && Boolean(
  props.selectedModel?.serviceTiers.some(option => option.id === BUDDY_FAST_SERVICE_TIER),
))
const isFastMode = computed(() => supportsFastMode.value
  && props.selectedServiceTier === BUDDY_FAST_SERVICE_TIER)

useEventListener(document, 'pointerdown', handleDocumentPointerDown)
useEventListener(document, 'keydown', handleDocumentKeydown)

function toggle() {
  if (!canOpen.value)
    return
  isOpen.value = !isOpen.value
  activePanel.value = 'main'
  secondaryPanel.value = null
}

function close() {
  isOpen.value = false
  activePanel.value = 'main'
  secondaryPanel.value = null
  previewEffort.value = null
  isMeterDragging.value = false
}

function selectEffort(value: BuddyThinkingLevel) {
  emit('updateEffort', value)
  close()
}

function selectMeterEffort(value: BuddyThinkingLevel) {
  emit('updateEffort', value)
}

function previewMeterEffort(value: BuddyThinkingLevel | null) {
  if (value) {
    const currentIndex = reasoningLevelOptions.value.findIndex(option => option.value === displayedEffort.value)
    const nextIndex = reasoningLevelOptions.value.findIndex(option => option.value === value)
    if (currentIndex >= 0 && nextIndex >= 0 && currentIndex !== nextIndex)
      effortTransitionDirection.value = nextIndex > currentIndex ? 'increasing' : 'decreasing'
  }
  previewEffort.value = value
}

function updateMeterDragging(value: boolean) {
  isMeterDragging.value = value
}

function selectModel(modelId: string) {
  emit('updateModel', modelId)
  activePanel.value = 'main'
  secondaryPanel.value = null
}

function clearModel() {
  emit('clearModel')
  close()
}

function toggleFastMode() {
  emit('updateServiceTier', isFastMode.value ? null : BUDDY_FAST_SERVICE_TIER)
}

function openAdvancedPanel() {
  activePanel.value = 'advanced'
  secondaryPanel.value = null
  previewEffort.value = null
  isMeterDragging.value = false
}

function openMainPanel() {
  activePanel.value = 'main'
  secondaryPanel.value = null
  previewEffort.value = null
  isMeterDragging.value = false
}

function toggleSecondaryPanel(panel: 'model' | 'reasoning') {
  secondaryPanel.value = secondaryPanel.value === panel ? null : panel
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

function formatReasoningLabel(value: BuddyThinkingLevel): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`
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
        :aria-label="t('desktop.chat.clearModel')"
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
      <section
        v-if="activePanel === 'main'"
        class="desktop-model-selector__panel desktop-model-selector__panel--spell"
      >
        <div class="desktop-model-selector__panel-heading">
          <button
            class="desktop-model-selector__advanced"
            type="button"
            @click="openAdvancedPanel"
          >
            <span>{{ t('desktop.chat.advanced') }}</span>
            <NIcon :component="ChevronRight16Regular" />
          </button>
          <span class="desktop-model-selector__heading-status">
            <Transition name="desktop-model-selector__status" mode="out-in">
              <span
                v-if="isMeterDragging"
                key="reasoning-level"
                class="desktop-model-selector__dragging-effort"
                :class="`is-${effortTransitionDirection}`"
              >
                <Transition :name="`desktop-model-selector__effort-${effortTransitionDirection}`">
                  <span
                    :key="displayedEffort ?? 'none'"
                    class="desktop-model-selector__dragging-effort-label"
                  >
                    {{ displayedEffortLabel }}
                  </span>
                </Transition>
              </span>
              <button
                v-else-if="supportsFastMode"
                key="fast-toggle"
                class="desktop-model-selector__fast-toggle"
                :class="{ 'is-active': isFastMode }"
                type="button"
                role="switch"
                :aria-checked="isFastMode"
                :aria-label="t('desktop.chat.fastMode')"
                @click="toggleFastMode"
              >
                <NIcon :component="Flash20Filled" />
              </button>
            </Transition>
          </span>
        </div>

        <div v-if="reasoningLevelOptions.length" class="desktop-model-selector__spell">
          <DesktopReasoningMeter
            :label="t('desktop.chat.effort')"
            :options="reasoningLevelOptions"
            :selected-effort="selectedEffortValue"
            @dragging="updateMeterDragging"
            @preview="previewMeterEffort"
            @select="selectMeterEffort"
          />
        </div>
        <div v-else class="desktop-model-selector__no-reasoning">
          {{ t('desktop.chat.noReasoningLevels') }}
        </div>
      </section>

      <section
        v-else-if="activePanel === 'advanced'"
        class="desktop-model-selector__panel desktop-model-selector__panel--advanced"
        role="menu"
      >
        <button class="desktop-model-selector__back" type="button" @click="openMainPanel">
          <NIcon :component="ChevronLeft16Regular" />
          <span>{{ t('desktop.chat.advanced') }}</span>
        </button>
        <span class="desktop-model-selector__divider" />
        <button
          class="desktop-model-selector__item"
          :class="{ 'is-active': secondaryPanel === 'model' }"
          type="button"
          @click="toggleSecondaryPanel('model')"
        >
          <span>{{ t('desktop.chat.model') }}</span>
          <strong>{{ selectedModel?.displayName ?? placeholder ?? t('desktop.chat.noModels') }}</strong>
          <NIcon :component="ChevronRight16Regular" />
        </button>
        <button
          v-if="reasoningLevelOptions.length"
          class="desktop-model-selector__item"
          :class="{ 'is-active': secondaryPanel === 'reasoning' }"
          type="button"
          @click="toggleSecondaryPanel('reasoning')"
        >
          <span>{{ t('desktop.chat.effort') }}</span>
          <strong>{{ selectedEffortLabel }}</strong>
          <NIcon :component="ChevronRight16Regular" />
        </button>
        <button
          v-if="supportsFastMode"
          class="desktop-model-selector__item"
          :class="{ 'is-fast': isFastMode }"
          type="button"
          role="menuitemcheckbox"
          :aria-checked="isFastMode"
          @click="toggleFastMode"
        >
          <span>{{ t('desktop.chat.speed') }}</span>
          <strong>{{ t(isFastMode ? 'desktop.chat.fastMode' : 'desktop.chat.standardSpeed') }}</strong>
          <NIcon :component="Flash20Filled" />
        </button>
      </section>

      <DesktopReasoningPicker
        v-if="activePanel === 'advanced' && secondaryPanel === 'reasoning'"
        :language="language"
        :options="reasoningLevelOptions"
        :selected-effort="selectedEffortValue"
        @select="selectEffort"
      />

      <DesktopModelPicker
        v-else-if="activePanel === 'advanced' && secondaryPanel === 'model'"
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
  --desktop-model-popover-radius: var(--buddy-menu-radius);

  position: relative;
  min-width: 0;
}

.desktop-model-selector__control {
  position: relative;
  min-width: 0;

  &.is-clearable .desktop-model-selector__trigger {
    padding-right: 2rem;
  }

  &.is-clearable:hover .desktop-model-selector__clear,
  &.is-clearable:has(.desktop-model-selector__clear:focus-visible) .desktop-model-selector__clear {
    opacity: 1;
    pointer-events: auto;
  }
}

.desktop-model-selector__trigger {
  display: inline-flex;
  min-width: 0;
  max-width: min(22rem, 44vw);
  height: var(--buddy-composer-control-height);
  align-items: center;
  gap: 0.35rem;
  border: 0;
  border-radius: var(--buddy-composer-control-radius);
  background: transparent;
  color: var(--buddy-text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 0.78rem;
  padding: 0 0.45rem 0 0.55rem;
  transition:
    background-color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing),
    color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing);

  &.is-compact:hover,
  &.is-compact:focus-visible {
    background: var(--buddy-accent-surface-subtle);
    color: var(--buddy-text-strong);
  }

  &.is-compact[aria-expanded='true'] {
    background: var(--buddy-accent-surface);
    color: var(--buddy-text-strong);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: -2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  &.is-fast {
    color: var(--buddy-accent-text);
  }

  &.is-field {
    width: 100%;
    max-width: none;
    height: 2.25rem;
    border: 1px solid var(--buddy-border-subtle);
    border-radius: 0.5rem;
    background: var(--buddy-surface-raised);
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
  color: var(--buddy-text-muted);
}

.desktop-model-selector__flash {
  flex: none;
  color: var(--buddy-brand-gold);
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
  color: var(--buddy-text-muted);
  cursor: pointer;
  opacity: 0;
  padding: 0;
  pointer-events: none;
  transform: translateY(-50%);
  transition: opacity 80ms ease;

  &:hover,
  &:focus-visible {
    background: var(--buddy-state-hover);
    color: var(--buddy-text-secondary);
    outline: 0;
  }
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

.desktop-model-selector__panel {
  flex: none;
  overflow: hidden;
  width: min(17rem, calc(100vw - 2rem));
  border: 1px solid var(--buddy-border-subtle);
  border-radius: var(--desktop-model-popover-radius);
  background: var(--buddy-surface-raised);
  box-shadow: var(--buddy-shadow-overlay);
  padding: 0.375rem;
}

.desktop-model-selector__panel--spell {
  --desktop-model-spell-glow:
    radial-gradient(ellipse at 42% 50%, rgb(217 166 83 / 18%), transparent 43%),
    radial-gradient(ellipse at 70% 50%, rgb(53 83 165 / 14%), transparent 46%);

  position: relative;
  background: linear-gradient(145deg, #fff, color-mix(in srgb, var(--buddy-surface-raised) 94%, #f8f6f0));
  padding: 0.375rem 0.5rem 0.5rem;
}

:global(:root[data-buddy-theme='dark'] .desktop-model-selector__panel--spell) {
  --desktop-model-spell-glow:
    radial-gradient(ellipse at 42% 50%, rgb(218 164 78 / 20%), transparent 43%),
    radial-gradient(ellipse at 72% 50%, rgb(51 80 174 / 24%), transparent 48%);

  border-color: rgb(255 255 255 / 13%);
  background: linear-gradient(145deg, #20242c, #171a21 76%);
  box-shadow:
    0 1px 2px rgb(0 0 0 / 28%),
    0 10px 24px rgb(0 0 0 / 36%);
}

.desktop-model-selector__panel--spell::after {
  position: absolute;
  right: 0.75rem;
  bottom: -1.4rem;
  left: 0.75rem;
  height: 2.7rem;
  border-radius: 50%;
  background: var(--desktop-model-spell-glow);
  content: '';
  filter: blur(0.75rem);
  pointer-events: none;
}

.desktop-model-selector__panel-heading {
  display: flex;
  min-height: var(--buddy-menu-row-height);
  align-items: center;
  justify-content: space-between;
}

.desktop-model-selector__heading-status {
  display: grid;
  min-width: 1.75rem;
  min-height: 1.75rem;
  align-items: center;
  justify-items: end;
}

.desktop-model-selector__dragging-effort {
  display: grid;
  color: var(--buddy-text-secondary);
  font-size: 0.76rem;
  line-height: 1;
  padding-inline: 0.4rem;
}

.desktop-model-selector__dragging-effort-label {
  grid-area: 1 / 1;
  justify-self: end;
  white-space: nowrap;
}

.desktop-model-selector__effort-increasing-enter-active,
.desktop-model-selector__effort-increasing-leave-active,
.desktop-model-selector__effort-decreasing-enter-active,
.desktop-model-selector__effort-decreasing-leave-active {
  transition:
    filter 100ms ease,
    opacity 90ms ease,
    transform 120ms cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: filter, opacity, transform;
}

.desktop-model-selector__effort-increasing-enter-from,
.desktop-model-selector__effort-decreasing-leave-to {
  filter: blur(1px);
  opacity: 0;
  transform: translateX(-0.22rem);
}

.desktop-model-selector__effort-increasing-leave-to,
.desktop-model-selector__effort-decreasing-enter-from {
  filter: blur(1px);
  opacity: 0;
  transform: translateX(0.22rem);
}

.desktop-model-selector__status-enter-active,
.desktop-model-selector__status-leave-active {
  transition:
    opacity 90ms ease,
    transform 120ms ease;
}

.desktop-model-selector__status-enter-from {
  opacity: 0;
  transform: translateY(0.2rem);
}

.desktop-model-selector__status-leave-to {
  opacity: 0;
  transform: translateY(-0.2rem);
}

@media (prefers-reduced-motion: reduce) {
  .desktop-model-selector__effort-increasing-enter-active,
  .desktop-model-selector__effort-increasing-leave-active,
  .desktop-model-selector__effort-decreasing-enter-active,
  .desktop-model-selector__effort-decreasing-leave-active {
    transition: none;
  }
}

.desktop-model-selector__advanced,
.desktop-model-selector__back {
  display: inline-flex;
  min-width: 3rem;
  height: 1.75rem;
  align-items: center;
  justify-content: center;
  gap: 0;
  border: 0;
  border-radius: var(--buddy-menu-item-radius);
  background: transparent;
  color: var(--buddy-text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 0.74rem;
  line-height: 1;
  padding: 0.25rem 0.3rem;
}

.desktop-model-selector__advanced :deep(.n-icon),
.desktop-model-selector__back :deep(.n-icon) {
  flex: none;
  font-size: 1rem;
  margin-inline: -0.125rem;
  transform: translateY(-0.04rem);
}

.desktop-model-selector__advanced:hover,
.desktop-model-selector__advanced:focus-visible,
.desktop-model-selector__back:hover,
.desktop-model-selector__back:focus-visible {
  background: var(--buddy-state-hover);
  color: var(--buddy-text-strong);
  outline: 0;
}

.desktop-model-selector__fast-toggle {
  display: grid;
  width: 1.75rem;
  height: 1.75rem;
  place-items: center;
  border: 0;
  border-radius: var(--buddy-icon-button-radius);
  background: transparent;
  color: var(--buddy-text-muted);
  cursor: pointer;
  padding: 0;
  transition:
    background-color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing),
    color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing);
}

.desktop-model-selector__fast-toggle:hover,
.desktop-model-selector__fast-toggle:focus-visible {
  background: var(--buddy-state-hover);
  color: var(--buddy-text-strong);
  outline: 0;
}

.desktop-model-selector__fast-toggle.is-active {
  background: color-mix(in srgb, var(--buddy-brand-gold) 14%, transparent);
  color: var(--buddy-brand-gold);
  filter: drop-shadow(0 0 0.35rem color-mix(in srgb, var(--buddy-brand-gold) 44%, transparent));
}

.desktop-model-selector__spell {
  position: relative;
  z-index: 1;
}

.desktop-model-selector__no-reasoning {
  color: var(--buddy-text-muted);
  font-size: 0.72rem;
  padding: 0.55rem 0.35rem 0.45rem;
}

.desktop-model-selector__panel--advanced {
  display: grid;
  gap: var(--buddy-menu-row-gap);
}

.desktop-model-selector__back {
  justify-content: flex-start;
  justify-self: start;
  padding-inline: 0.15rem 0.45rem;
}

.desktop-model-selector__divider {
  height: 1px;
  margin: 0 0.2rem 0.125rem;
  background: var(--buddy-border-subtle);
}

.desktop-model-selector__item {
  display: grid;
  min-width: 0;
  min-height: var(--buddy-menu-row-height);
  grid-template-columns: 4.5rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.5rem;
  border: 0;
  border-radius: var(--buddy-menu-item-radius);
  background: transparent;
  color: var(--buddy-text-strong);
  cursor: pointer;
  font: inherit;
  padding: 0.3rem 0.5rem;
  text-align: left;

  &:hover,
  &:focus-visible,
  &.is-active {
    background: var(--buddy-state-hover);
    outline: 0;
  }

  > span {
    font-size: 0.76rem;
  }

  > strong {
    overflow: hidden;
    color: var(--buddy-text-secondary);
    font-size: 0.76rem;
    font-weight: 500;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  > :deep(.n-icon) {
    color: var(--buddy-text-muted);
  }

  &.is-fast > :deep(.n-icon) {
    color: var(--buddy-brand-gold);
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
