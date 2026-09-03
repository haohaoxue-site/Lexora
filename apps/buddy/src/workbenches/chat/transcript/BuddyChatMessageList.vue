<script setup lang="ts">
import type {
  LocalChangeSetSummary,
  LocalConversationBranch,
  LocalConversationTimelineItem,
  LocalMessage,
  LocalRun,
  LocalRunEvent,
  LocalRunOutput,
} from '@buddy-electron/shared/localChatApi'
import type {
  projectConversationCompactionState,
} from './chatConversationTimeline'
import type {
  BuddyChatMessageListHandle,
  BuddyChatTranscriptViewportHandle,
  ChatMessageScrollAnchor,
  ChatMessageScrollMetrics,
} from './chatMessageViewport'
import type { ChatOutlineItem } from './chatOutline'
import type {
  ChatAgentTurn,
} from './chatStreamingMessage'
import type { ChatTranscriptRow } from './chatTranscriptProjection'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { computed, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import BuddyChatAgentTurn from './BuddyChatAgentTurn.vue'
import BuddyChatMessageRow from './BuddyChatMessageRow.vue'
import BuddyChatOutline from './BuddyChatOutline.vue'
import BuddyChatRunActivity from './BuddyChatRunActivity.vue'
import BuddyChatTranscriptViewport from './BuddyChatTranscriptViewport.vue'
import { resolveChatAgentTurnOpen } from './chatAgentTurnDisclosure'
import {
  projectConversationCompaction,
} from './chatConversationTimeline'
import { projectChatMessageBranchNavigators } from './chatMessageBranches'
import {
  formatChatDayDividerLabel,
  projectChatTranscriptDisplayRows,
} from './chatMessageTime'
import { projectChatTranscript } from './chatTranscriptProjection'

const props = defineProps<{
  activeSearchMessageId?: string | null
  activeBranchId: string
  actionsDisabled?: boolean
  branches: ReadonlyArray<LocalConversationBranch>
  changeSets?: ReadonlyArray<LocalChangeSetSummary>
  hasOlderMessages?: boolean
  isLoadingOlderMessages?: boolean
  language: BuddyLocale
  matchingSearchMessageIds?: ReadonlyArray<string>
  outlineItems: ReadonlyArray<ChatOutlineItem>
  outlineLoading: boolean
  timelineItems: ReadonlyArray<LocalConversationTimelineItem>
  runEvents?: ReadonlyArray<LocalRunEvent>
  runOutputs?: ReadonlyArray<LocalRunOutput>
  runs?: ReadonlyArray<LocalRun>
  showReturnToLatest?: boolean
}>()

const emit = defineEmits<{
  activateBranch: [branchId: string]
  editUserMessage: [messageId: string, content: string]
  openArtifact: [artifactId: string]
  openChanges: [changeSetId: string]
  prepareOutline: []
  readerLayoutIntent: []
  regenerateAssistant: [sourceRunId: string]
  returnToLatest: []
  selectOutlineMessage: [messageId: string]
  scroll: [metrics: ChatMessageScrollMetrics]
  contentResize: [metrics: ChatMessageScrollMetrics]
}>()

const { t } = useBuddyI18n(() => props.language)
const transcriptViewport = useTemplateRef<BuddyChatTranscriptViewportHandle>('transcriptViewport')
const OUTLINE_HIGHLIGHT_DURATION_MS = 1_200
const agentTurnOpenOverrides = shallowRef<ReadonlyMap<string, boolean>>(new Map())
const editingMessageId = shallowRef<string | null>(null)
const activeOutlineMessageId = shallowRef<string | null>(null)
const highlightedOutlineMessageId = shallowRef<string | null>(null)
let outlineHighlightTimer: number | null = null
const matchingSearchMessageIds = computed(() => new Set(props.matchingSearchMessageIds ?? []))
const conversationId = computed(() => props.timelineItems[0]?.conversationId ?? null)
const transcriptProjection = computed(() => projectChatTranscript({
  changeSets: props.changeSets ?? [],
  outputs: props.runOutputs ?? [],
  runEvents: props.runEvents ?? [],
  runs: props.runs ?? [],
  timelineItems: props.timelineItems,
}))
const displayRows = computed(
  () => projectChatTranscriptDisplayRows(transcriptProjection.value.rows),
)
const branchNavigators = computed(() => projectChatMessageBranchNavigators(
  transcriptProjection.value.rows,
  props.branches,
  props.activeBranchId,
))

watch([conversationId, () => props.activeBranchId], () => {
  agentTurnOpenOverrides.value = new Map()
  activeOutlineMessageId.value = null
  clearOutlineHighlight()
})

function isAgentTurnOpen(turn: ChatAgentTurn): boolean {
  return resolveChatAgentTurnOpen(
    turn.status,
    agentTurnOpenOverrides.value.get(turn.runId),
  )
}

function toggleAgentTurn(turn: ChatAgentTurn) {
  const next = new Map(agentTurnOpenOverrides.value)
  next.set(turn.runId, !isAgentTurnOpen(turn))
  agentTurnOpenOverrides.value = next
}

function regenerateMessage(message: LocalMessage) {
  if (message.runId)
    emit('regenerateAssistant', message.runId)
}

function isEditingMessage(message: LocalMessage): boolean {
  return editingMessageId.value === message.id
}

function startEditingMessage(message: LocalMessage) {
  editingMessageId.value = message.id
}

function cancelEditingMessage() {
  editingMessageId.value = null
}

function submitEditedMessage(message: LocalMessage, content: string) {
  emit('editUserMessage', message.id, content)
  cancelEditingMessage()
}

function recoveryNoticeLabel(
  notice: Extract<ChatTranscriptRow, { kind: 'recovery-notice' }>['notice'],
): string {
  return t('desktop.chat.recoveryAttachmentsMissing', {
    count: notice.missingAttachmentCount,
  })
}

function compactionLabel(
  compaction: Extract<LocalConversationTimelineItem, { kind: 'compaction' }>,
): string {
  return compactionStateLabel(projectConversationCompaction(compaction).state)
}

function compactionStateLabel(
  state: ReturnType<typeof projectConversationCompactionState>,
): string {
  switch (state) {
    case 'running':
      return t('desktop.chat.compactionStarted')
    case 'completed':
      return t('desktop.chat.compactionCompleted')
    case 'cancelled':
      return t('desktop.chat.compactionCancelled')
    case 'not_needed':
      return t('desktop.chat.compactionNotNeeded')
    case 'authentication_required':
      return t('desktop.chat.compactionAuthenticationRequired')
    case 'provider_unavailable':
      return t('desktop.chat.compactionProviderUnavailable')
    case 'failed':
      return t('desktop.chat.compactionFailed')
  }
}

function compactionTokenLabel(
  compaction: Extract<LocalConversationTimelineItem, { kind: 'compaction' }>,
): string | null {
  const presentation = projectConversationCompaction(compaction)
  if (
    presentation.tokensBefore === undefined
    || presentation.estimatedTokensAfter === undefined
  ) {
    return null
  }
  return t('desktop.chat.compactionTokens', {
    after: presentation.estimatedTokensAfter.toLocaleString(),
    before: presentation.tokensBefore.toLocaleString(),
  })
}

function readScrollMetrics(): ChatMessageScrollMetrics | null {
  return transcriptViewport.value?.readScrollMetrics() ?? null
}

function captureScrollAnchor(): ChatMessageScrollAnchor | null {
  return transcriptViewport.value?.captureScrollAnchor() ?? null
}

function restoreScrollAnchor(anchor: ChatMessageScrollAnchor): ChatMessageScrollMetrics | null {
  return transcriptViewport.value?.restoreScrollAnchor(anchor) ?? null
}

function scrollToTail(): ChatMessageScrollMetrics | null {
  return transcriptViewport.value?.scrollToTail() ?? null
}

function scrollToMessage(
  messageId: string,
  behavior?: ScrollBehavior,
): ChatMessageScrollMetrics | null {
  return transcriptViewport.value?.scrollToMessage(messageId, behavior) ?? null
}

function highlightMessage(messageId: string) {
  clearOutlineHighlight()
  highlightedOutlineMessageId.value = messageId
  outlineHighlightTimer = window.setTimeout(() => {
    highlightedOutlineMessageId.value = null
    outlineHighlightTimer = null
  }, OUTLINE_HIGHLIGHT_DURATION_MS)
}

function clearOutlineHighlight() {
  if (outlineHighlightTimer !== null)
    window.clearTimeout(outlineHighlightTimer)
  outlineHighlightTimer = null
  highlightedOutlineMessageId.value = null
}

function scrollTranscript(deltaY: number) {
  transcriptViewport.value?.scrollBy(deltaY)
}

function handleReaderLayoutIntent(event: MouseEvent) {
  if (event.target instanceof Element && event.target.closest('button[aria-expanded]'))
    emit('readerLayoutIntent')
}

defineExpose<BuddyChatMessageListHandle>({
  captureScrollAnchor,
  highlightMessage,
  readScrollMetrics,
  restoreScrollAnchor,
  scrollToMessage,
  scrollToTail,
})

onBeforeUnmount(clearOutlineHighlight)
</script>

<template>
  <div
    class="buddy-chat-message-list"
    role="log"
    @click.capture="handleReaderLayoutIntent"
  >
    <div
      v-if="isLoadingOlderMessages"
      class="buddy-chat-message-list__history-status"
      role="status"
    >
      {{ t('desktop.chat.loadingOlder') }}
    </div>
    <BuddyChatOutline
      :active-message-id="activeOutlineMessageId"
      :is-loading="outlineLoading"
      :items="outlineItems"
      :language="language"
      @prepare="emit('prepareOutline')"
      @select="emit('selectOutlineMessage', $event)"
      @scroll-transcript="scrollTranscript"
    />
    <BuddyChatTranscriptViewport
      ref="transcriptViewport"
      :has-older-messages="hasOlderMessages ?? false"
      :return-to-latest-label="t('desktop.chat.returnToLatest')"
      :show-return-to-latest="showReturnToLatest ?? false"
      @active-message-change="activeOutlineMessageId = $event"
      @content-resize="emit('contentResize', $event)"
      @return-to-latest="emit('returnToLatest')"
      @scroll="emit('scroll', $event)"
    >
      <template v-for="item in displayRows" :key="item.key">
        <div
          v-if="item.kind === 'day-divider'"
          class="buddy-chat-day-divider buddy-chat-transcript-row"
        >
          <time :datetime="item.createdAt">
            {{ formatChatDayDividerLabel(item.createdAt, language) }}
          </time>
        </div>

        <BuddyChatMessageRow
          v-else-if="item.kind === 'message'"
          :actions-disabled="actionsDisabled ?? false"
          :active-search="item.message.id === activeSearchMessageId"
          :branch-navigator="branchNavigators.get(item.message.id) ?? null"
          class="buddy-chat-transcript-row" :class="[
            { 'is-outline-highlighted': item.message.id === highlightedOutlineMessageId },
          ]"
          :editing="isEditingMessage(item.message)"
          :is-agent-turn-result="item.isAgentTurnResult"
          :language="language"
          :message="item.message"
          :search-match="matchingSearchMessageIds.has(item.message.id)"
          :streaming="item.streaming === true"
          :turn-outputs="item.turnOutputs"
          :turn-changes="item.turnChanges"
          @activate-branch="emit('activateBranch', $event)"
          @cancel-edit="cancelEditingMessage"
          @edit="submitEditedMessage(item.message, $event)"
          @open-artifact="emit('openArtifact', $event)"
          @open-changes="emit('openChanges', $event)"
          @regenerate="regenerateMessage(item.message)"
          @start-edit="startEditingMessage(item.message)"
        />

        <BuddyChatAgentTurn
          v-else-if="item.kind === 'agent-turn'"
          :actions-disabled="actionsDisabled ?? false"
          :branch-navigator="branchNavigators.get(item.turn.runId) ?? null"
          class="buddy-chat-transcript-row"
          :language="language"
          :open="isAgentTurnOpen(item.turn)"
          :owns-result-actions="item.ownsResultActions === true"
          :turn="item.turn"
          @activate-branch="emit('activateBranch', $event)"
          @regenerate="emit('regenerateAssistant', item.turn.runId)"
          @toggle="toggleAgentTurn(item.turn)"
        />

        <BuddyChatRunActivity
          v-else-if="item.kind === 'activity'"
          class="buddy-chat-transcript-row"
          :language="language"
          :turn="item.turn"
        />

        <div
          v-else-if="item.kind === 'recovery-notice'"
          class="buddy-chat-system-event buddy-chat-transcript-row is-warning"
          role="status"
        >
          <span>{{ recoveryNoticeLabel(item.notice) }}</span>
        </div>

        <div
          v-else-if="item.kind === 'compaction'"
          class="buddy-chat-system-event buddy-chat-transcript-row"
          :data-compaction-id="item.compaction.id"
        >
          <span>{{ compactionLabel(item.compaction) }}</span>
          <small v-if="compactionTokenLabel(item.compaction)">
            {{ compactionTokenLabel(item.compaction) }}
          </small>
        </div>
      </template>
    </BuddyChatTranscriptViewport>
  </div>
</template>

<style scoped lang="scss">
.buddy-chat-message-list {
  position: relative;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.buddy-chat-message-list__history-status {
  position: absolute;
  z-index: 2;
  top: 0.45rem;
  left: 50%;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: var(--buddy-radius-micro);
  background: var(--buddy-surface-raised);
  color: var(--buddy-text-secondary);
  font-size: 0.68rem;
  padding: 0.25rem 0.6rem;
  pointer-events: none;
  transform: translateX(-50%);
}

.buddy-chat-transcript-row {
  box-sizing: border-box;
  width: min(
    calc(
      var(--buddy-chat-reading-width)
      + var(--buddy-chat-inline-gutter)
      + var(--buddy-chat-inline-gutter)
    ),
    100%
  );
  margin: 0 auto;
  padding-inline: var(--buddy-chat-inline-gutter);
}

.buddy-chat-agent-turn.buddy-chat-transcript-row {
  padding-bottom: var(--buddy-chat-gap-block);
}

.buddy-chat-message.buddy-chat-transcript-row {
  border-radius: var(--buddy-radius-micro);
  outline: 1px solid transparent;
  outline-offset: -1px;
  transition: outline-color 180ms ease-out;

  &.is-outline-highlighted {
    outline-color: var(--buddy-accent-border);
  }
}

.buddy-chat-day-divider {
  display: flex;
  justify-content: center;
  color: var(--buddy-text-muted);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  line-height: 1.25rem;
  padding-block: 0.75rem 1.25rem;
}

.buddy-chat-agent-turn.has-visible-process.buddy-chat-transcript-row {
  padding-bottom: var(--buddy-chat-gap-section);
}

.buddy-chat-system-event {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  color: var(--buddy-text-secondary);
  font-size: 0.7rem;
  padding-bottom: 1rem;

  &::before,
  &::after {
    width: min(4rem, 10vw);
    height: 1px;
    background: var(--buddy-border-subtle);
    content: '';
  }

  small {
    color: var(--buddy-text-muted);
    font-size: 0.65rem;
  }

  &.is-warning {
    color: var(--buddy-status-warning-text);

    &::before,
    &::after {
      background: var(--buddy-status-warning-border);
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .buddy-chat-message.buddy-chat-transcript-row {
    transition: none;
  }
}
</style>
