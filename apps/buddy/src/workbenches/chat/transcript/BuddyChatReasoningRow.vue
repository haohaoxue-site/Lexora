<script setup lang="ts">
import type { ChatAgentReasoningEntry } from './chatStreamingMessage'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { ChevronRight20Regular } from '@vicons/fluent'
import { NIcon } from 'naive-ui'
import { computed, shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { renderChatMarkdown, toChatSummaryText } from './chatMarkdown'

const props = defineProps<{
  entry: ChatAgentReasoningEntry
  language: BuddyLocale
}>()

const { t } = useBuddyI18n(() => props.language)
const isOpen = shallowRef(false)
const hasDisclosure = computed(() => Boolean(props.entry.summary && props.entry.detail))
const isRunning = computed(() => (
  props.entry.summary?.status === 'running' || props.entry.detail?.status === 'running'
))
const summary = computed(() => {
  const node = props.entry.summary
  if (!node)
    return ''
  const text = node.text.trim()
  if (!text) {
    return t(node.status === 'running'
      ? 'desktop.chat.processReasoningRunning'
      : 'desktop.chat.processReasoningDone')
  }
  const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean)
  return toChatSummaryText(node.status === 'running' ? lines.at(-1) ?? text : lines[0] ?? text)
})
const bodyHtml = computed(() => renderChatMarkdown(
  props.entry.detail?.text ?? props.entry.summary?.text ?? '',
))
</script>

<template>
  <section
    class="buddy-chat-reasoning-entry"
    :class="{ 'has-disclosure': hasDisclosure, 'is-running': isRunning }"
  >
    <button
      v-if="hasDisclosure"
      :aria-expanded="isOpen"
      class="buddy-chat-reasoning-entry__header is-expandable"
      type="button"
      @click="isOpen = !isOpen"
    >
      <span class="buddy-chat-reasoning-entry__summary">{{ summary }}</span>
      <NIcon
        :component="ChevronRight20Regular"
        class="buddy-chat-reasoning-entry__chevron"
        :class="{ 'is-open': isOpen }"
      />
    </button>
    <div
      v-show="(entry.detail || entry.summary) && (!hasDisclosure || isOpen)"
      class="buddy-chat-reasoning-entry__body"
      v-html="bodyHtml"
    />
  </section>
</template>

<style scoped lang="scss">
.buddy-chat-reasoning-entry {
  display: grid;
  min-width: 0;
}

.buddy-chat-reasoning-entry__header {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  min-height: 24px;
  border: 0;
  background: transparent;
  color: var(--buddy-chat-tool-title-color);
  font: inherit;
  padding: 0;
  text-align: left;

  &.is-expandable {
    cursor: pointer;
  }
}

.buddy-chat-reasoning-entry__chevron {
  width: var(--buddy-chat-node-icon-size);
  height: var(--buddy-chat-node-icon-size);
  flex: 0 0 auto;
  margin-left: 6px;
  color: var(--buddy-chat-meta-color);
  opacity: 0;
  transition:
    opacity var(--buddy-motion-state-duration) var(--buddy-motion-state-easing),
    transform 120ms ease;

  &.is-open {
    transform: rotate(90deg) translateX(0.5px);
  }
}

.buddy-chat-reasoning-entry:hover .buddy-chat-reasoning-entry__chevron,
.buddy-chat-reasoning-entry__header:focus-visible .buddy-chat-reasoning-entry__chevron {
  opacity: 1;
}

.buddy-chat-reasoning-entry__summary {
  min-width: 0;
  overflow: hidden;
  color: var(--buddy-chat-process-color);
  font-size: 14px;
  line-height: 24px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-chat-reasoning-entry.is-running .buddy-chat-reasoning-entry__summary {
  animation: buddy-chat-reasoning-pulse 1.8s ease-in-out infinite;
}

.buddy-chat-reasoning-entry__body {
  max-height: 12rem;
  margin: 0;
  overflow: auto;
  color: var(--buddy-chat-tool-body-color);
  font-size: 14px;
  line-height: 24px;
  overflow-wrap: anywhere;
  padding: 0.25rem 0;

  :deep(> :first-child) {
    margin-top: 0;
  }

  :deep(> :last-child) {
    margin-bottom: 0;
  }

  :deep(p) {
    margin: 0.35rem 0;
  }
}

.buddy-chat-reasoning-entry.has-disclosure .buddy-chat-reasoning-entry__body {
  margin-top: var(--buddy-chat-gap-tight);
}

@keyframes buddy-chat-reasoning-pulse {
  50% { opacity: 0.55; }
}

@media (prefers-reduced-motion: reduce) {
  .buddy-chat-reasoning-entry.is-running .buddy-chat-reasoning-entry__summary {
    animation: none;
  }

  .buddy-chat-reasoning-entry__chevron {
    transition: none;
  }
}
</style>
