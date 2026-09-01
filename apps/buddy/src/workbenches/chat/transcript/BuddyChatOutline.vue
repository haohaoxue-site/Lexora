<script setup lang="ts">
import type { ChatOutlineItem } from './chatOutline'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { Keyboard20Regular, Wand20Regular } from '@vicons/fluent'
import { NIcon } from 'naive-ui'
import { computed, shallowRef, useTemplateRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  activeMessageId: string | null
  isLoading: boolean
  items: ReadonlyArray<ChatOutlineItem>
  language: BuddyLocale
}>()

const emit = defineEmits<{
  prepare: []
  select: [messageId: string]
  scrollTranscript: [deltaY: number]
}>()

const MAX_RAIL_ITEM_COUNT = 48

const { t } = useBuddyI18n(() => props.language)
const root = useTemplateRef<HTMLElement>('root')
const isExpanded = shallowRef(false)
const railItems = computed(() => {
  if (props.items.length <= MAX_RAIL_ITEM_COUNT)
    return props.items

  const indexes = Array.from({ length: MAX_RAIL_ITEM_COUNT }, (_, index) => (
    Math.round(index * (props.items.length - 1) / (MAX_RAIL_ITEM_COUNT - 1))
  ))
  const activeIndex = props.items.findIndex(item => item.messageId === props.activeMessageId)
  if (activeIndex >= 0 && !indexes.includes(activeIndex)) {
    let nearestIndex = 0
    for (let index = 1; index < indexes.length; index += 1) {
      if (Math.abs(indexes[index] - activeIndex) < Math.abs(indexes[nearestIndex] - activeIndex))
        nearestIndex = index
    }
    indexes[nearestIndex] = activeIndex
  }

  return [...new Set(indexes)]
    .sort((left, right) => left - right)
    .map(index => props.items[index])
})

function expand() {
  isExpanded.value = true
  emit('prepare')
}

function collapse() {
  isExpanded.value = false
}

function handleFocusOut(event: FocusEvent) {
  if (!(event.relatedTarget instanceof Node) || !root.value?.contains(event.relatedTarget))
    isExpanded.value = false
}

function roleLabel(item: ChatOutlineItem): string {
  return t(item.kind === 'input' ? 'desktop.chat.outlineInput' : 'desktop.chat.outlineOutput')
}

function itemText(item: ChatOutlineItem): string {
  return item.attachmentOnly ? t('desktop.chat.outlineAttachment') : item.text
}

function itemAriaLabel(item: ChatOutlineItem): string {
  return t('desktop.chat.outlineNavigate', {
    role: roleLabel(item),
    text: itemText(item),
  })
}

function roleIcon(item: ChatOutlineItem) {
  return item.kind === 'input' ? Keyboard20Regular : Wand20Regular
}

function handleRailWheel(event: WheelEvent) {
  const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX)
    ? event.deltaY
    : event.deltaX
  const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? window.innerHeight
      : 1
  emit('scrollTranscript', delta * multiplier)
}

function select(messageId: string) {
  collapse()
  emit('select', messageId)
}
</script>

<template>
  <aside
    v-if="items.length"
    ref="root"
    class="buddy-chat-outline"
    :aria-label="t('desktop.chat.outline')"
    @focusin="expand"
    @focusout="handleFocusOut"
    @mouseenter="expand"
    @mouseleave="collapse"
  >
    <section v-if="isExpanded" class="buddy-chat-outline__panel">
      <div v-if="isLoading" class="buddy-chat-outline__loading" role="status">
        {{ t('desktop.chat.outlineLoading') }}
      </div>
      <ol class="buddy-chat-outline__list">
        <li
          v-for="item in items"
          :key="item.messageId"
          class="buddy-chat-outline__item"
          :class="[`is-${item.kind}`, { 'is-active': item.messageId === activeMessageId }]"
        >
          <button
            type="button"
            class="buddy-chat-outline__item-button"
            :aria-label="itemAriaLabel(item)"
            :aria-current="item.messageId === activeMessageId ? 'location' : undefined"
            @click="select(item.messageId)"
          >
            <NIcon
              class="buddy-chat-outline__role-icon"
              :component="roleIcon(item)"
              aria-hidden="true"
            />
            <span class="buddy-chat-outline__text">{{ itemText(item) }}</span>
          </button>
        </li>
      </ol>
    </section>

    <ol class="buddy-chat-outline__rail" @wheel.prevent="handleRailWheel">
      <li
        v-for="item in railItems"
        :key="item.messageId"
        class="buddy-chat-outline__indicator"
        :class="{ 'is-active': item.messageId === activeMessageId }"
      >
        <button
          type="button"
          class="buddy-chat-outline__indicator-button"
          :aria-label="itemAriaLabel(item)"
          :aria-current="item.messageId === activeMessageId ? 'location' : undefined"
          @click="select(item.messageId)"
        >
          <span class="buddy-chat-outline__indicator-line" />
        </button>
      </li>
    </ol>
  </aside>
</template>

<style scoped lang="scss">
.buddy-chat-outline {
  position: absolute;
  z-index: 4;
  top: 1rem;
  right: 0.875rem;
  width: 22px;
  height: calc(100% - 2rem);
}

.buddy-chat-outline__panel {
  position: absolute;
  top: 0;
  right: calc(100% + 0.5rem);
  box-sizing: border-box;
  display: flex;
  width: 15rem;
  max-height: 100%;
  flex-direction: column;
  gap: 0.25rem;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: var(--buddy-radius-micro);
  background: var(--buddy-surface-raised);
  box-shadow: var(--buddy-shadow-overlay);
  padding: 0.625rem;

  &::after {
    position: absolute;
    top: 0;
    right: -0.5rem;
    width: 0.5rem;
    height: 100%;
    content: '';
  }
}

.buddy-chat-outline__loading {
  color: var(--buddy-text-secondary);
  font-size: 0.68rem;
  line-height: 1.5;
  padding: 0.125rem 0.25rem;
}

.buddy-chat-outline__list {
  display: grid;
  min-height: 0;
  flex: 1;
  align-content: start;
  gap: 0.125rem;
  margin: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0;
  list-style: none;
}

.buddy-chat-outline__item {
  min-width: 0;
  border-radius: var(--buddy-radius-micro);
  color: var(--buddy-text-primary);

  &.is-active {
    background: var(--buddy-accent-surface);
    color: var(--buddy-accent-on-surface);
  }
}

.buddy-chat-outline__item-button {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: 1rem minmax(0, 1fr);
  align-items: center;
  gap: 0.375rem;
  border: 0;
  border-radius: inherit;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 0.42rem 0.5rem;
  text-align: left;

  &:hover {
    background: var(--buddy-state-hover);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: -2px;
  }
}

.buddy-chat-outline__role-icon {
  color: var(--buddy-text-muted);
  font-size: 1rem;
}

.buddy-chat-outline__item.is-active .buddy-chat-outline__role-icon {
  color: var(--buddy-accent-text);
}

.buddy-chat-outline__text {
  overflow: hidden;
  font-size: 0.75rem;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-chat-outline__rail {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  margin: 0;
  overflow: hidden;
  padding: 0.125rem 0;
  list-style: none;
}

.buddy-chat-outline__indicator {
  display: flex;
  width: 100%;
  max-height: 6px;
  flex: 1 1 6px;
  justify-content: flex-end;
}

.buddy-chat-outline__indicator-button {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: flex-end;
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 0;

  &:focus-visible {
    outline: 0;
  }
}

.buddy-chat-outline__indicator-line {
  display: block;
  width: 14px;
  height: min(2px, 100%);
  border-radius: 1px;
  background: var(--buddy-border-strong);
}

.buddy-chat-outline__indicator.is-active .buddy-chat-outline__indicator-line,
.buddy-chat-outline__indicator-button:focus-visible .buddy-chat-outline__indicator-line {
  width: 18px;
  background: var(--buddy-accent-solid);
}
</style>
