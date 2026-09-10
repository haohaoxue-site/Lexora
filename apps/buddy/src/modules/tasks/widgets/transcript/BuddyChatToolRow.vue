<script setup lang="ts">
import type { ChatAgentToolNode } from '../../model/transcript/chatStreamingMessage'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { ChevronRight20Regular } from '@vicons/fluent'
import { computed } from 'vue'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import { canExpandChatTool, describeChatTool, isChatToolActive, isChatToolIssue } from '../../model/transcript/chatToolDisplay'
import BuddyChatToolIcon from './BuddyChatToolIcon.vue'
import { useChatToolActions } from './chatToolActionsContext'

const props = defineProps<{
  language: BuddyLocale
  node: ChatAgentToolNode
  open: boolean
  compact?: 'start' | 'continuation'
  compactTarget?: string
  hasNext?: boolean
  highlighted?: boolean
}>()
const emit = defineEmits<{ toggle: [] }>()
const actions = useChatToolActions()
const display = computed(() => describeChatTool(props.node, props.language))
const canExpand = computed(() => canExpandChatTool(props.node, actions.canPreviewFile))
const active = computed(() => isChatToolActive(props.node))
const issue = computed(() => isChatToolIssue(props.node))
</script>

<template>
  <section class="buddy-chat-tool" :class="[`is-${node.status}`, compact && `is-compact-${compact}`, { 'is-selected': open, 'is-highlighted': highlighted }]" :data-tool-call-id="node.toolCallId" tabindex="-1">
    <button
      class="buddy-chat-tool__header"
      :aria-expanded="canExpand ? open : undefined"
      :aria-label="[display.label, display.fullTarget, issue || active ? display.status : ''].filter(Boolean).join(' · ')"
      :disabled="!canExpand"
      :title="[display.label, display.fullTarget].filter(Boolean).join(' · ')"
      type="button"
      @click="emit('toggle')"
    >
      <BuddyChatToolIcon v-if="compact !== 'continuation'" :icon="display.icon" class="buddy-chat-tool__icon" />
      <span v-if="compact !== 'continuation'" class="buddy-chat-tool__title">{{ display.label }}</span>
      <code v-if="display.target" class="buddy-chat-tool__summary">{{ compactTarget ?? display.target }}<span v-if="hasNext" class="buddy-chat-tool__separator" aria-hidden="true">,</span></code>
      <span v-if="display.context && !compact" class="buddy-chat-tool__context">{{ display.context }}</span>
      <span v-if="issue || active || node.presentation.card === 'directory-authorization' || node.presentation.card === 'system'" class="buddy-chat-tool__status" :class="{ 'is-issue': issue }" :title="display.status">
        <span v-if="active && node.status !== 'awaiting_approval'" class="buddy-chat-tool__spinner" aria-hidden="true" />
        <span>{{ display.status }}</span>
      </span>
      <DesktopIcon v-if="!compact" :component="ChevronRight20Regular" class="buddy-chat-tool__chevron" :class="{ 'is-open': open, 'is-hidden': !canExpand }" />
    </button>
  </section>
</template>

<style scoped lang="scss">
.buddy-chat-tool {
  min-width: 0;
}

.buddy-chat-tool.is-compact-start,
.buddy-chat-tool.is-compact-continuation {
  display: inline;
}

.buddy-chat-tool.is-compact-start::before {
  display: block;
  content: '';
}

.is-compact-start .buddy-chat-tool__header,
.is-compact-continuation .buddy-chat-tool__header {
  display: inline-flex;
  width: auto;
  max-width: 100%;
  vertical-align: middle;
}

.buddy-chat-tool__separator {
  color: var(--buddy-text-muted);
  font-size: var(--buddy-chat-tool-font-size);
}

.is-selected:is(.is-compact-start, .is-compact-continuation) .buddy-chat-tool__header {
  background: var(--buddy-state-hover);
}

.is-highlighted .buddy-chat-tool__header {
  background: var(--buddy-status-warning-surface);
}

.buddy-chat-tool:focus-visible {
  outline: 2px solid var(--buddy-focus-ring);
  outline-offset: 2px;
  border-radius: var(--buddy-radius-micro);
}

.buddy-chat-tool__header {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 28px;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border: 0;
  border-radius: var(--buddy-radius-micro);
  background: transparent;
  color: var(--buddy-text-secondary);
  font: inherit;
  font-size: var(--buddy-chat-tool-font-size);
  line-height: 20px;
  text-align: left;
  cursor: pointer;
  &:not(:disabled):hover {
    background: var(--buddy-state-hover);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: default;
  }
}

.buddy-chat-tool__chevron {
  width: 12px;
  height: 12px;
  flex: none;
  color: var(--buddy-text-muted);
  opacity: 0.65;
  transition: transform 120ms ease;
}

.buddy-chat-tool__chevron.is-open {
  transform: rotate(90deg);
}

.buddy-chat-tool__chevron.is-hidden {
  visibility: hidden;
}

.buddy-chat-tool__icon {
  width: 14px;
  height: 14px;
  flex: none;
  color: var(--buddy-text-muted);
}

.buddy-chat-tool__title {
  flex: 0 0 auto;
  max-width: 40%;
  overflow: hidden;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-chat-tool__summary {
  min-width: 0;
  overflow: hidden;
  color: var(--buddy-text-primary);
  font: inherit;
  font-family: var(--buddy-font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-chat-tool__context {
  flex: 0 2 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--buddy-text-muted);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-chat-tool__status {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
  max-width: 40%;
  margin-left: auto;
  padding-left: 6px;
  color: var(--buddy-text-muted);
  font-size: 11px;
  white-space: nowrap;
}

.buddy-chat-tool__status > span:not(.buddy-chat-tool__spinner) {
  overflow: hidden;
  text-overflow: ellipsis;
}

.buddy-chat-tool__status.is-issue {
  color: var(--buddy-status-warning-text);
}

.buddy-chat-tool.is-failed .buddy-chat-tool__status {
  color: var(--buddy-chat-danger-color);
}

.buddy-chat-tool.is-awaiting_approval .buddy-chat-tool__status {
  color: var(--buddy-status-warning-text);
}

.buddy-chat-tool__spinner {
  width: 10px;
  height: 10px;
  flex: none;
  border: 1.5px solid var(--buddy-border-strong);
  border-top-color: var(--buddy-text-secondary);
  border-radius: 50%;
  animation: tool-spin 900ms linear infinite;
}

@keyframes tool-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .buddy-chat-tool__chevron {
    transition: none;
  }

  .buddy-chat-tool__spinner {
    animation: none;
  }
}
</style>
