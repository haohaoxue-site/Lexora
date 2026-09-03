<script setup lang="ts">
import type { ChatAgentToolNode } from './chatStreamingMessage'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import {
  CalendarClock20Regular,
  ChevronRight20Regular,
  Document20Regular,
  DrawImage20Regular,
  Edit20Regular,
  Globe20Regular,
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
import BuddyChatShimmerText from './BuddyChatShimmerText.vue'
import BuddyChatToolDetails from './BuddyChatToolDetails.vue'

const props = defineProps<{
  language: BuddyLocale
  node: ChatAgentToolNode
}>()

const { t } = useBuddyI18n(() => props.language)
const isOpen = shallowRef(defaultOpen())
const hasManualToggle = shallowRef(false)
const shimmerMode = computed<'continuous' | 'static'>(() => {
  switch (props.node.status) {
    case 'completed':
    case 'denied':
    case 'failed':
    case 'interrupted':
      return 'static'
    default:
      return 'continuous'
  }
})
const canExpand = computed(() => {
  const presentation = props.node.presentation
  return presentation.card === 'terminal'
    || (presentation.card === 'image' && Boolean(
      presentation.prompt
      || presentation.reference
      || presentation.artifactIds.length,
    ))
    || (
      props.node.status !== 'denied'
      && 'output' in presentation
      && Boolean(presentation.output)
    )
    || (presentation.card === 'diff' && Boolean(presentation.diff))
})
const title = computed(() => {
  switch (props.node.presentation.card) {
    case 'browser': return browserOperationLabel(props.node.presentation.operation)
    case 'terminal': return t('desktop.chat.processToolCommand')
    case 'read': return t('desktop.chat.processToolRead')
    case 'search': return t('desktop.chat.processToolSearch')
    case 'diff': return t(props.node.presentation.operation === 'created'
      ? 'desktop.chat.processToolCreate'
      : 'desktop.chat.processToolEdit')
    case 'connector': return t('desktop.chat.processToolConnector')
    case 'image': return t('desktop.chat.processToolImage')
    case 'pet': return t('desktop.chat.processToolPet')
    case 'system': return t('desktop.chat.processToolSystemAction')
    case 'automation': return t('desktop.chat.processToolAutomation')
    case 'generic': return props.node.toolName
  }
  return props.node.toolName
})
const summary = computed(() => {
  const presentation = props.node.presentation
  const lifecycle = props.node.status === 'awaiting_approval'
    ? t('desktop.chat.processAwaitingApproval')
    : props.node.status === 'preparing'
      ? t('desktop.chat.processToolPreparing')
      : props.node.status === 'denied'
        ? t('desktop.chat.processToolApprovalDenied')
        : null
  if (presentation.card === 'browser') {
    return [
      lifecycle ?? (presentation.status === 'failed'
        ? t('desktop.chat.processToolFailed')
        : null),
      presentation.origin,
      presentation.operation === 'snapshot' && presentation.elementCount !== null
        ? t('desktop.chat.processToolBrowserElementCount', {
            count: presentation.elementCount,
          })
        : null,
    ].filter(Boolean).join(' · ')
  }
  if (presentation.card === 'terminal') {
    return [
      terminalStatusLabel(presentation),
      presentation.command,
    ].filter(Boolean).join(' · ')
  }
  if (presentation.card === 'system') {
    const targetUnavailable = presentation.status === 'action-expired'
      || presentation.status === 'target-ambiguous'
      || presentation.status === 'target-changed'
      || presentation.status === 'target-not-found'
    const target = targetUnavailable
      ? null
      : presentation.target
        ?? t('desktop.chat.processToolSystemTargetPending')
    return [
      translateSystemAction(props.language, presentation.action),
      target,
      lifecycle ?? translateSystemToolStatus(props.language, presentation.status),
    ].filter(Boolean).join(' · ')
  }
  if (presentation.card === 'automation') {
    return [
      automationOperationLabel(presentation.operation),
      presentation.name,
      presentation.itemCount === null
        ? null
        : t('desktop.chat.processToolAutomationCount', { count: presentation.itemCount }),
      lifecycle ?? presentation.status,
    ].filter(Boolean).join(' · ')
  }
  if (presentation.card === 'image') {
    return lifecycle ?? (
      presentation.status === 'completed' && presentation.generatedCount !== null
        ? t('desktop.chat.processToolImageCount', { count: presentation.generatedCount })
        : presentation.status === 'failed'
          ? t('desktop.chat.processToolFailed')
          : t('desktop.chat.processToolImageRunning')
    )
  }
  const detail = (() => {
    switch (presentation.card) {
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
    lifecycle,
    summary,
  ].filter(Boolean).join(' · ')
})
const leadingIcon = computed(() => {
  switch (props.node.presentation.card) {
    case 'browser': return Globe20Regular
    case 'terminal': return WindowConsole20Regular
    case 'read': return Document20Regular
    case 'search': return Search20Regular
    case 'diff': return Edit20Regular
    case 'connector': return PlugConnected20Regular
    case 'image': return DrawImage20Regular
    case 'pet': return Sparkle20Regular
    case 'system': return Wrench20Regular
    case 'automation': return CalendarClock20Regular
    case 'generic': return Wrench20Regular
  }
  return Wrench20Regular
})

function browserOperationLabel(
  operation: Extract<ChatAgentToolNode['presentation'], { card: 'browser' }>['operation'],
): string {
  switch (operation) {
    case 'act': return t('desktop.chat.processToolBrowserAct')
    case 'open': return t('desktop.chat.processToolBrowserOpen')
    case 'snapshot': return t('desktop.chat.processToolBrowserSnapshot')
  }
}

function terminalStatusLabel(
  presentation: Extract<ChatAgentToolNode['presentation'], { card: 'terminal' }>,
): string {
  switch (props.node.status) {
    case 'awaiting_approval': return t('desktop.chat.processAwaitingApproval')
    case 'completed': return t('desktop.chat.processToolSucceeded')
    case 'denied': return t('desktop.chat.processToolApprovalDenied')
    case 'failed': return presentation.exitCode === null
      ? t('desktop.chat.processToolFailed')
      : t('desktop.chat.processToolExitCode', { code: presentation.exitCode })
    case 'interrupted': return t('desktop.chat.processToolInterrupted')
    case 'preparing': return t('desktop.chat.processToolPreparing')
    case 'running': return t('desktop.chat.processToolRunning')
  }
}

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
  return props.node.status === 'denied'
    || props.node.status === 'failed'
    || (
      (props.node.status === 'preparing' || props.node.status === 'running')
      && props.node.presentation.card === 'terminal'
    )
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
      <BuddyChatShimmerText
        class="buddy-chat-tool__title"
        :mode="shimmerMode"
      >
        {{ title }}
      </BuddyChatShimmerText>
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
      :expanded="isOpen && canExpand"
      :language="language"
      :presentation="node.presentation"
      :status="node.status"
      :tool-name="node.toolName"
    />
  </section>
</template>

<style scoped lang="scss">
.buddy-chat-tool {
  --buddy-shimmer-duration: 1.35s;
  --buddy-shimmer-highlight: var(--buddy-text-strong);
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
  color: var(--buddy-accent-text);
}

.buddy-chat-tool__chevron {
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

.buddy-chat-tool:hover .buddy-chat-tool__chevron,
.buddy-chat-tool__header:focus-visible .buddy-chat-tool__chevron {
  opacity: 1;
}

.buddy-chat-tool.is-failed .buddy-chat-tool__icon {
  color: var(--buddy-chat-danger-color);
}

.buddy-chat-tool.is-interrupted .buddy-chat-tool__icon {
  color: var(--buddy-text-muted);
}

.buddy-chat-tool.is-denied .buddy-chat-tool__icon,
.buddy-chat-tool.is-awaiting_approval .buddy-chat-tool__icon {
  color: var(--buddy-status-warning-text);
}

.buddy-chat-tool__title {
  --buddy-shimmer-base: var(--buddy-chat-tool-title-color);

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
