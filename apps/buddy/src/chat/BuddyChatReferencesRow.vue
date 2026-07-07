<script setup lang="ts">
import type { BuddyChatTranscriptReferencesRow } from '@/chat/chatTranscriptView'
import { ChevronDown16Regular, ChevronRight16Regular } from '@vicons/fluent'
import { NIcon } from 'naive-ui'
import { computed, shallowRef } from 'vue'

const props = defineProps<{
  row: BuddyChatTranscriptReferencesRow
}>()

const referencesOpen = shallowRef(props.row.defaultOpen)
const expandedItemKeys = shallowRef<ReadonlySet<string>>(new Set())

const referencesToggleIcon = computed(() =>
  referencesOpen.value ? ChevronDown16Regular : ChevronRight16Regular,
)

function handleReferencesToggle(event: Event) {
  const target = event.currentTarget
  referencesOpen.value = target instanceof HTMLDetailsElement && target.open
}

function hasItemDetail(item: BuddyChatTranscriptReferencesRow['items'][number]) {
  return Boolean(item.detail.trim()) && item.detail.trim() !== item.body.trim()
}

function isItemExpanded(key: string) {
  return expandedItemKeys.value.has(key)
}

function toggleItemDetail(key: string) {
  const nextKeys = new Set(expandedItemKeys.value)
  if (nextKeys.has(key))
    nextKeys.delete(key)
  else
    nextKeys.add(key)

  expandedItemKeys.value = nextKeys
}
</script>

<template>
  <article class="buddy-chat-references">
    <details
      class="buddy-chat-references__body"
      :open="referencesOpen"
      @toggle="handleReferencesToggle"
    >
      <summary class="buddy-chat-references__summary">
        <span class="buddy-chat-references__title">
          {{ row.title }}
          <span class="buddy-chat-references__summary-count"> · {{ row.summaryLabel }}</span>
        </span>
        <NIcon
          aria-hidden="true"
          class="buddy-chat-references__toggle"
          :component="referencesToggleIcon"
        />
      </summary>

      <ul class="buddy-chat-references__items">
        <li
          v-for="item in row.items"
          :key="item.key"
          :class="`is-${item.kind}`"
        >
          <button
            v-if="hasItemDetail(item)"
            class="buddy-chat-references__item-header is-toggleable"
            type="button"
            :aria-expanded="isItemExpanded(item.key)"
            @click="toggleItemDetail(item.key)"
          >
            <span class="buddy-chat-references__item-label">{{ item.label }}</span>
            <NIcon
              aria-hidden="true"
              class="buddy-chat-references__item-toggle"
              :component="isItemExpanded(item.key) ? ChevronDown16Regular : ChevronRight16Regular"
            />
          </button>
          <span
            v-else
            class="buddy-chat-references__item-header"
          >
            <span class="buddy-chat-references__item-label">{{ item.label }}</span>
          </span>
          <span
            v-if="item.body"
            class="buddy-chat-references__item-body"
            :class="{ 'is-expanded': isItemExpanded(item.key) }"
          >
            {{ isItemExpanded(item.key) ? item.detail : item.body }}
          </span>
          <span
            v-if="item.summary"
            class="buddy-chat-references__item-summary"
          >
            {{ item.summary }}
          </span>
        </li>
      </ul>
    </details>
  </article>
</template>

<style scoped lang="scss">
.buddy-chat-references {
  max-width: min(100%, 860px);
  color: var(--buddy-chat-tool-title-color);
}

.buddy-chat-references__body {
  min-width: 0;
}

.buddy-chat-references__summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  max-width: 100%;
  color: var(--buddy-chat-tool-title-color);
  cursor: pointer;
  font-size: var(--buddy-chat-tool-font-size);
  line-height: var(--buddy-chat-tool-line-height);
  list-style: none;
  user-select: none;
}

.buddy-chat-references__summary::-webkit-details-marker {
  display: none;
}

.buddy-chat-references__summary::marker {
  content: "";
}

.buddy-chat-references__title {
  min-width: 0;
  color: var(--buddy-chat-tool-title-color);
}

.buddy-chat-references__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  color: var(--buddy-chat-meta-color);
  font-size: 16px;
  line-height: 1;
  opacity: 0;
  transition: opacity 120ms ease;
}

.buddy-chat-references__summary:hover .buddy-chat-references__toggle,
.buddy-chat-references__summary:focus-visible .buddy-chat-references__toggle {
  opacity: 1;
}

.buddy-chat-references__summary-count {
  color: var(--buddy-chat-meta-color);
  font-size: var(--buddy-chat-tool-font-size);
}

.buddy-chat-references__items {
  display: grid;
  gap: 14px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.buddy-chat-references__items li {
  display: grid;
  gap: 4px;
  min-width: 0;
  color: var(--buddy-chat-tool-body-color);
  font-size: var(--buddy-chat-tool-font-size);
  line-height: var(--buddy-chat-tool-body-line-height);
}

.buddy-chat-references__item-header {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  max-width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: var(--buddy-chat-tool-line-height);
  padding: 0;
  text-align: left;
}

.buddy-chat-references__item-header.is-toggleable {
  cursor: pointer;
}

.buddy-chat-references__item-label {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--buddy-chat-process-color);
}

.buddy-chat-references__item-header.is-toggleable:hover .buddy-chat-references__item-label,
.buddy-chat-references__item-header.is-toggleable:focus-visible .buddy-chat-references__item-label {
  color: var(--buddy-chat-tool-title-color);
}

.buddy-chat-references__item-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  color: var(--buddy-chat-meta-color);
  font-size: 16px;
  line-height: 1;
  opacity: 1;
}

.buddy-chat-references__items li.is-meta .buddy-chat-references__item-label {
  overflow-wrap: anywhere;
  font-family: var(--buddy-font-mono);
}

.buddy-chat-references__item-body {
  display: -webkit-box;
  overflow: hidden;
  color: var(--buddy-chat-tool-body-color);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow-wrap: anywhere;
}

.buddy-chat-references__item-body.is-expanded {
  display: block;
  overflow: visible;
  white-space: pre-wrap;
}

.buddy-chat-references__item-summary {
  overflow-wrap: anywhere;
  color: var(--buddy-chat-meta-color);
  font-size: var(--buddy-chat-caption-font-size);
  line-height: var(--buddy-chat-caption-line-height);
}
</style>
