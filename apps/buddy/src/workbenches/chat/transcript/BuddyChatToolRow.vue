<script setup lang="ts">
import type { ChatAgentToolNode } from './chatStreamingMessage'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import {
  CalendarClock20Regular,
  ChevronRight20Regular,
  Document20Regular,
  Edit20Regular,
  PlugConnected20Regular,
  Search20Regular,
  Sparkle20Regular,
  WindowConsole20Regular,
  Wrench20Regular,
} from '@vicons/fluent'
import { NIcon } from 'naive-ui'
import { computed, shallowRef, watch } from 'vue'
import {
  translateSystemAction,
  translateSystemToolStatus,
  useBuddyI18n,
} from '@/i18n/buddyI18n'
import BuddyChatToolDetails from './BuddyChatToolDetails.vue'

const props = defineProps<{
  language: BuddyLocale
  node: ChatAgentToolNode
}>()

const { t } = useBuddyI18n(() => props.language)
const isOpen = shallowRef(defaultOpen())
const hasManualToggle = shallowRef(false)
const canExpand = computed(() => {
  const presentation = props.node.presentation
  return presentation.card === 'terminal'
    || (
      presentation.card !== 'automation'
      && presentation.card !== 'pet'
      && Boolean(presentation.output)
    )
    || (presentation.card === 'diff' && Boolean(presentation.diff))
})
const title = computed(() => {
  switch (props.node.presentation.card) {
    case 'terminal': return t('desktop.chat.processToolCommand')
    case 'read': return t('desktop.chat.processToolRead')
    case 'search': return t('desktop.chat.processToolSearch')
    case 'diff': return t(props.node.presentation.operation === 'created'
      ? 'desktop.chat.processToolCreate'
      : 'desktop.chat.processToolEdit')
    case 'connector': return t('desktop.chat.processToolConnector')
    case 'pet': return t('desktop.chat.processToolPet')
    case 'system': return t(props.node.presentation.action === 'inspect'
      ? 'desktop.chat.processToolSystemInspect'
      : 'desktop.chat.processToolSystemAction')
    case 'automation': return t('desktop.chat.processToolAutomation')
    case 'generic': return props.node.toolName
  }
  return props.node.toolName
})
const summary = computed(() => {
  const presentation = props.node.presentation
  if (presentation.card === 'system') {
    const recoveringTarget = presentation.status === 'target-changed'
      || presentation.status === 'target-expired'
      || presentation.status === 'target-unknown'
    const target = recoveringTarget
      ? null
      : presentation.target
        ?? (presentation.action === 'inspect'
          ? null
          : t('desktop.chat.processToolSystemTargetPending'))
    return [
      presentation.action === 'inspect'
        ? null
        : translateSystemAction(props.language, presentation.action),
      target,
      translateSystemToolStatus(props.language, presentation.status),
    ].filter(Boolean).join(' · ')
  }
  if (presentation.card === 'automation') {
    return [
      automationOperationLabel(presentation.operation),
      presentation.name,
      presentation.itemCount === null
        ? null
        : t('desktop.chat.processToolAutomationCount', { count: presentation.itemCount }),
      props.node.status === 'awaiting_approval'
        ? t('desktop.chat.processAwaitingApproval')
        : presentation.status,
    ].filter(Boolean).join(' · ')
  }
  const detail = (() => {
    switch (presentation.card) {
      case 'terminal': return presentation.command
      case 'read': return presentation.path
      case 'search': return [presentation.query, presentation.path].filter(Boolean).join(' · ')
      case 'diff': return presentation.path
      case 'connector': return `${presentation.connector} · ${presentation.tool}`
      case 'pet': return presentation.macro
      case 'generic': return presentation.argumentNames.join(', ')
    }
    return ''
  })()
  const summary = detail || props.node.description
  return [
    props.node.status === 'awaiting_approval'
      ? t('desktop.chat.processAwaitingApproval')
      : null,
    summary,
  ].filter(Boolean).join(' · ')
})
const leadingIcon = computed(() => {
  switch (props.node.presentation.card) {
    case 'terminal': return WindowConsole20Regular
    case 'read': return Document20Regular
    case 'search': return Search20Regular
    case 'diff': return Edit20Regular
    case 'connector': return PlugConnected20Regular
    case 'pet': return Sparkle20Regular
    case 'system': return Wrench20Regular
    case 'automation': return CalendarClock20Regular
    case 'generic': return Wrench20Regular
  }
  return Wrench20Regular
})

function automationOperationLabel(
  operation: Extract<ChatAgentToolNode['presentation'], { card: 'automation' }>['operation'],
): string {
  switch (operation) {
    case 'list': return t('desktop.chat.processToolAutomationList')
    case 'get': return t('desktop.chat.processToolAutomationGet')
    case 'upsert': return t('desktop.chat.processToolAutomationUpsert')
    case 'pause': return t('desktop.chat.processToolAutomationPause')
    case 'resume': return t('desktop.chat.processToolAutomationResume')
    case 'delete': return t('desktop.chat.processToolAutomationDelete')
    case 'run_now': return t('desktop.chat.processToolAutomationRunNow')
  }
}

watch(() => props.node.status, () => {
  if (!hasManualToggle.value)
    isOpen.value = defaultOpen()
})

function defaultOpen(): boolean {
  return props.node.status === 'failed'
    || (props.node.status === 'running' && props.node.presentation.card === 'terminal')
}

function toggle() {
  if (!canExpand.value)
    return
  hasManualToggle.value = true
  isOpen.value = !isOpen.value
}
</script>

<template>
  <section class="buddy-chat-tool" :class="`is-${node.status}`">
    <button
      :aria-expanded="canExpand ? isOpen : undefined"
      class="buddy-chat-tool__header"
      :class="{ 'is-expandable': canExpand }"
      :disabled="!canExpand"
      type="button"
      @click="toggle"
    >
      <NIcon :component="leadingIcon" class="buddy-chat-tool__icon" />
      <span class="buddy-chat-tool__title">{{ title }}</span>
      <code class="buddy-chat-tool__summary">{{ summary }}</code>
      <NIcon
        v-if="canExpand"
        :component="ChevronRight20Regular"
        class="buddy-chat-tool__chevron"
        :class="{ 'is-open': isOpen }"
      />
    </button>
    <BuddyChatToolDetails
      v-show="isOpen && canExpand"
      :language="language"
      :presentation="node.presentation"
      :status="node.status"
    />
  </section>
</template>

<style scoped lang="scss">
.buddy-chat-tool {
  display: grid;
  min-width: 0;
}

.buddy-chat-tool__header {
  position: relative;
  display: flex;
  overflow: hidden;
  width: 100%;
  min-width: 0;
  align-items: center;
  min-height: 24px;
  border: 0;
  background: transparent;
  color: var(--buddy-chat-tool-title-color);
  cursor: pointer;
  font: inherit;
  padding: 0;
  text-align: left;

  &:disabled {
    cursor: default;
  }

  .buddy-chat-tool__summary {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    color: var(--buddy-chat-tool-body-color);
    font-family: inherit;
    font-size: 14px;
    line-height: 24px;
    margin-left: 8px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.buddy-chat-tool__icon,
.buddy-chat-tool__chevron {
  width: var(--buddy-chat-node-icon-size);
  height: var(--buddy-chat-node-icon-size);
  flex: 0 0 auto;
}

.buddy-chat-tool__icon {
  margin-right: 6px;
  color: var(--buddy-accent-primary);
}

.buddy-chat-tool__chevron {
  margin-left: 6px;
  color: var(--buddy-chat-meta-color);
  opacity: 1;
  transition: transform 120ms ease;

  &.is-open {
    transform: rotate(90deg) translateX(0.5px);
  }
}

.buddy-chat-tool.is-failed .buddy-chat-tool__icon {
  color: var(--buddy-chat-danger-color);
}

.buddy-chat-tool.is-interrupted .buddy-chat-tool__icon {
  color: var(--buddy-text-placeholder);
}

.buddy-chat-tool.is-awaiting_approval .buddy-chat-tool__icon {
  color: var(--buddy-accent-warning);
}

.buddy-chat-tool__title {
  font-weight: 550;
  font-size: 14px;
  line-height: 24px;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .buddy-chat-tool__chevron {
    transition: none;
  }
}
</style>
