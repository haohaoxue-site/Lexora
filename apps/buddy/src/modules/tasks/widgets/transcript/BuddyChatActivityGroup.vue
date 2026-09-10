<script setup lang="ts">
import type { ChatAgentActivityGroup } from '../../model/transcript/chatAgentActivities'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { ChevronRight20Regular, ChevronUp20Regular } from '@vicons/fluent'
import { computed, nextTick, shallowRef, useTemplateRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import { presentChatActivityLayout } from '../../model/transcript/chatActivityLayout'
import { summarizeChatActivity, summarizeChatActivityCounts } from '../../model/transcript/chatActivitySummary'
import { canExpandChatTool, isChatToolIssue } from '../../model/transcript/chatToolDisplay'
import BuddyChatDisclosure from './BuddyChatDisclosure.vue'
import BuddyChatReasoningRow from './BuddyChatReasoningRow.vue'
import BuddyChatShimmerText from './BuddyChatShimmerText.vue'
import BuddyChatToolDetails from './BuddyChatToolDetails.vue'
import BuddyChatToolIcon from './BuddyChatToolIcon.vue'
import BuddyChatToolRow from './BuddyChatToolRow.vue'
import { useChatToolActions } from './chatToolActionsContext'
import { useChatActivitySummary } from './useChatActivitySummary'

const props = defineProps<{
  group: ChatAgentActivityGroup
  language: BuddyLocale
  openEntries: ReadonlyMap<string, boolean>
}>()
const emit = defineEmits<{ toggleEntry: [id: string], openEntry: [id: string] }>()
const { t } = useBuddyI18n(() => props.language)
const actions = useChatToolActions()
const open = shallowRef(false)
const highlightedIssue = shallowRef<string | null>(null)
const content = useTemplateRef<HTMLDivElement>('content')
const header = useTemplateRef<HTMLButtonElement>('header')
const singleTool = computed(() => props.group.nodes.length === 1 && props.group.toolCount === 1)
const layout = computed(() => presentChatActivityLayout(props.group.nodes))
const issues = computed(() => props.group.nodes.filter(node => node.kind === 'tool' && isChatToolIssue(node)))
const fullSummary = computed(() => summarizeChatActivityCounts(props.group, props.language, Infinity))
const currentSummary = computed(() => summarizeChatActivity(props.group, props.language))
const summary = useChatActivitySummary(() => currentSummary.value)
const label = computed(() => open.value && props.group.toolCount > 0
  ? summarizeChatActivityCounts(props.group, props.language)
  : summary.value.label)

function toggleTool(id: string) {
  highlightedIssue.value = null
  if (singleTool.value)
    open.value = true
  emit('toggleEntry', id)
}

async function revealNextIssue() {
  const index = issues.value.findIndex(node => node.id === highlightedIssue.value)
  const node = issues.value[(index + 1) % issues.value.length]
  if (node?.kind !== 'tool')
    return
  highlightedIssue.value = node.id
  open.value = true
  emit('openEntry', node.id)
  await nextTick()
  if (!open.value || highlightedIssue.value !== node.id)
    return
  const row = [...(content.value?.querySelectorAll<HTMLElement>('[data-tool-call-id]') ?? [])]
    .find(element => element.dataset.toolCallId === node.toolCallId)
  const target = row?.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? row
  target?.focus({ preventScroll: true })
  target?.scrollIntoView({ block: 'center', behavior: 'instant' })
}

function collapseFromBottom() {
  header.value?.focus({ preventScroll: true })
  header.value?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
  open.value = false
}
</script>

<template>
  <section
    class="buddy-chat-activity-group"
    :data-activity-id="group.id"
    :class="{ 'is-open': open, 'is-active': summary.active, 'is-thinking': group.toolCount === 0, 'is-tool-group': group.toolCount > 0 && !singleTool }"
  >
    <div v-if="!singleTool" class="buddy-chat-activity-group__heading">
      <button ref="header" class="buddy-chat-activity-group__header" type="button" :aria-expanded="open" :title="fullSummary" @click="open = !open">
        <span v-if="summary.active" class="buddy-chat-activity-group__spinner" aria-hidden="true" />
        <BuddyChatToolIcon v-else-if="summary.icon !== 'reasoning'" :icon="summary.icon" class="buddy-chat-activity-group__icon" />
        <BuddyChatShimmerText class="buddy-chat-activity-group__label" aria-live="polite" :mode="summary.active ? 'continuous' : 'static'">
          {{ label }}
        </BuddyChatShimmerText>
        <span v-if="!open && summary.target" class="buddy-chat-activity-group__target" :title="summary.target">{{ summary.target }}</span>
        <span v-if="group.runningCount > 1" class="buddy-chat-activity-group__count">{{ t('desktop.chat.activityRunningCount', { count: group.runningCount }) }}</span>
        <span v-else-if="!open && summary.active && group.toolCount > 1" class="buddy-chat-activity-group__count">{{ t('desktop.chat.activityCalls', { count: group.toolCount }) }}</span>
        <DesktopIcon :component="ChevronRight20Regular" class="buddy-chat-activity-group__chevron" :class="{ 'is-open': open }" />
      </button>
      <button v-if="group.issueCount" class="buddy-chat-activity-group__issues" type="button" :title="t('desktop.chat.activityNextIssue')" @click="revealNextIssue">
        {{ t('desktop.chat.activityIssueCount', { count: group.issueCount }) }}
      </button>
    </div>
    <BuddyChatDisclosure>
      <div v-if="open || singleTool" ref="content" class="buddy-chat-activity-group__content">
        <template v-for="entry in layout.entries" :key="entry.id">
          <BuddyChatToolRow
            v-if="entry.kind === 'tool'"
            :node="entry" :language="language" :open="openEntries.get(entry.id) === true"
            :compact="layout.compact.get(entry.id)?.position"
            :compact-target="layout.compact.get(entry.id)?.target"
            :has-next="layout.compact.get(entry.id)?.hasNext"
            :highlighted="highlightedIssue === entry.id"
            @toggle="toggleTool(entry.id)"
          />
          <BuddyChatDisclosure v-else-if="entry.kind === 'tool-details'">
            <BuddyChatToolDetails
              v-if="openEntries.get(entry.node.id) && canExpandChatTool(entry.node, actions.canPreviewFile)"
              :data-tool-detail-id="entry.node.toolCallId"
              :language="language" :presentation="entry.node.presentation"
              :status="entry.node.status" :tool-name="entry.node.toolName"
            />
          </BuddyChatDisclosure>
          <BuddyChatReasoningRow v-else class="buddy-chat-activity-group__thought" :node="entry" />
        </template>
        <button v-if="!singleTool && group.nodes.length > 8" class="buddy-chat-activity-group__collapse" type="button" @click="collapseFromBottom">
          <DesktopIcon :component="ChevronUp20Regular" />
          {{ t('desktop.chat.activityCollapse') }}
        </button>
      </div>
    </BuddyChatDisclosure>
  </section>
</template>

<style scoped lang="scss">
.buddy-chat-activity-group {
  min-width: 0;
}

.buddy-chat-activity-group__heading {
  display: flex;
  align-items: center;
  gap: 6px;
}

.buddy-chat-activity-group__header {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
  min-height: 30px;
  align-items: center;
  gap: 6px;
  margin-left: -4px;
  padding: 3px 4px;
  border: 0;
  border-radius: var(--buddy-radius-micro);
  background: transparent;
  color: var(--buddy-text-secondary);
  font: inherit;
  font-size: var(--buddy-chat-process-font-size);
  line-height: 22px;
  text-align: left;
  cursor: pointer;
  &:hover {
    background: var(--buddy-state-hover);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: 2px;
  }
}

.buddy-chat-activity-group__chevron {
  width: 14px;
  height: 14px;
  flex: none;
  color: var(--buddy-text-muted);
  opacity: 0.65;
  transition: transform 120ms ease;
}

.buddy-chat-activity-group__chevron.is-open {
  transform: rotate(90deg);
}

.buddy-chat-activity-group__icon {
  width: 14px;
  height: 14px;
  flex: none;
  color: var(--buddy-text-muted);
}

.buddy-chat-activity-group__spinner {
  width: 12px;
  height: 12px;
  margin-inline: 1px;
  flex: none;
  border: 1.5px solid var(--buddy-border-strong);
  border-top-color: var(--buddy-text-secondary);
  border-radius: 50%;
  animation: activity-spin 900ms linear infinite;
}

.buddy-chat-activity-group__label {
  --buddy-shimmer-base: var(--buddy-text-secondary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-chat-activity-group__target {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--buddy-text-muted);
  font-size: var(--buddy-chat-tool-font-size);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-chat-activity-group__count {
  flex: none;
  color: var(--buddy-text-muted);
  font-size: 11.5px;
  white-space: nowrap;
}

.buddy-chat-activity-group__issues {
  flex: none;
  padding: 4px 6px;
  border: 0;
  border-radius: var(--buddy-radius-micro);
  background: transparent;
  font: inherit;
  color: var(--buddy-status-warning-text);
  font-size: 11.5px;
  white-space: nowrap;
  cursor: pointer;

  &:hover { background: var(--buddy-status-warning-surface); }
  &:focus-visible { outline: 2px solid var(--buddy-focus-ring); outline-offset: 2px; }
}

.buddy-chat-activity-group__content {
  min-width: 0;
}

.buddy-chat-activity-group__collapse {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 0 0;
  padding: 3px 8px;
  border: 0;
  border-radius: var(--buddy-radius-micro);
  background: transparent;
  color: var(--buddy-text-muted);
  font: inherit;
  font-size: var(--buddy-chat-caption-font-size);
  cursor: pointer;

  :deep(.n-icon) { width: 14px; height: 14px; }
  &:hover { background: var(--buddy-state-hover); color: var(--buddy-text-secondary); }
  &:focus-visible { outline: 2px solid var(--buddy-focus-ring); outline-offset: 2px; }
}

.is-tool-group > .buddy-chat-activity-group__content {
  margin: 3px 0 6px;
  padding: 2px 4px 2px 8px;
}

.is-tool-group .buddy-chat-activity-group__thought {
  padding: 5px 8px 7px 28px;
}

.is-thinking > .buddy-chat-activity-group__content {
  margin: 3px 0 6px;
}

@keyframes activity-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .buddy-chat-activity-group__chevron {
    transition: none;
  }

  .buddy-chat-activity-group__spinner {
    animation: none;
  }
}
</style>
