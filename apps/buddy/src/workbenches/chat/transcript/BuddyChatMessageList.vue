<script setup lang="ts">
import type {
  LocalConversationBranch,
  LocalConversationTimelineItem,
  LocalMessage,
  LocalRun,
  LocalRunEvent,
} from '@buddy-electron/shared/localChatApi'
import type {
  projectConversationCompactionState,
} from './chatConversationTimeline'
import type {
  BuddyChatMessageListHandle,
  ChatMessageScrollAnchor,
  ChatMessageScrollMetrics,
} from './chatMessageViewport'
import type {
  ChatAgentTurn,
} from './chatStreamingMessage'
import type { ChatTranscriptRow } from './chatTranscriptProjection'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { NVirtualList } from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import BuddyChatAgentIdentity from './BuddyChatAgentIdentity.vue'
import BuddyChatAgentTurn from './BuddyChatAgentTurn.vue'
import BuddyChatMessageRow from './BuddyChatMessageRow.vue'
import BuddyChatRunActivity from './BuddyChatRunActivity.vue'
import { resolveChatAgentTurnOpen } from './chatAgentTurnDisclosure'
import {
  projectConversationCompaction,
} from './chatConversationTimeline'
import { renderChatMarkdown } from './chatMarkdown'
import { projectChatMessageBranchNavigators } from './chatMessageBranches'
import {
  formatChatDayDividerLabel,
  projectChatTranscriptDisplayRows,
} from './chatMessageTime'
import { resolvePrependedChatScrollTop } from './chatMessageViewport'
import {
  projectChatTranscript,
  shouldShowAssistantIdentity,
} from './chatTranscriptProjection'

const props = defineProps<{
  activeSearchMessageId?: string | null
  activeBranchId: string
  actionsDisabled?: boolean
  branches: ReadonlyArray<LocalConversationBranch>
  hasOlderMessages?: boolean
  isLoadingOlderMessages?: boolean
  language: BuddyLocale
  matchingSearchMessageIds?: ReadonlyArray<string>
  timelineItems: ReadonlyArray<LocalConversationTimelineItem>
  runEvents?: ReadonlyArray<LocalRunEvent>
  runs?: ReadonlyArray<LocalRun>
}>()

const emit = defineEmits<{
  activateBranch: [branchId: string]
  editUserMessage: [messageId: string, content: string]
  regenerateAssistant: [messageId: string]
  scroll: [metrics: ChatMessageScrollMetrics, tailScrollSettling: boolean]
  scrollPosition: [metrics: ChatMessageScrollMetrics, tailScrollSettling: boolean]
}>()

interface VirtualListHandle {
  scrollTo: (options: {
    debounce?: boolean
    key?: string
    position?: 'top' | 'bottom'
    top?: number
  }) => void
}

type VirtualScrollOptions = Parameters<VirtualListHandle['scrollTo']>[0]

const { t } = useBuddyI18n(() => props.language)
const root = useTemplateRef<HTMLDivElement>('root')
const virtualList = useTemplateRef<VirtualListHandle>('virtualList')
const scrollViewport = shallowRef<HTMLElement | null>(null)
const agentTurnOpenOverrides = shallowRef<ReadonlyMap<string, boolean>>(new Map())
const editingMessageId = shallowRef<string | null>(null)
let scrollFrame: number | null = null
let activeTailScrollGeneration: number | null = null
let tailScrollGeneration = 0
const matchingSearchMessageIds = computed(() => new Set(props.matchingSearchMessageIds ?? []))
const conversationId = computed(() => props.timelineItems[0]?.conversationId ?? null)
const transcriptProjection = computed(() => projectChatTranscript({
  runEvents: props.runEvents ?? [],
  runs: props.runs ?? [],
  timelineItems: props.timelineItems,
}))
const virtualRows = computed(
  () => projectChatTranscriptDisplayRows(transcriptProjection.value.rows),
)
const branchNavigators = computed(() => projectChatMessageBranchNavigators(
  props.timelineItems,
  props.branches,
  props.activeBranchId,
))

watch(conversationId, () => {
  agentTurnOpenOverrides.value = new Map()
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

function showAssistantIdentity(message: LocalMessage): boolean {
  return shouldShowAssistantIdentity(message, transcriptProjection.value)
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

function handleVirtualScroll(event: Event) {
  if (!(event.currentTarget instanceof HTMLElement))
    return
  scrollViewport.value = event.currentTarget
  emit(
    'scrollPosition',
    toScrollMetrics(event.currentTarget),
    activeTailScrollGeneration !== null,
  )
  if (scrollFrame !== null)
    return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = null
      const viewport = getScrollViewport()
      if (viewport)
        emit('scroll', toScrollMetrics(viewport), activeTailScrollGeneration !== null)
    })
  })
}

function getScrollViewport(): HTMLElement | null {
  return scrollViewport.value ?? root.value?.querySelector<HTMLElement>('.v-vl') ?? null
}

function readScrollMetrics(): ChatMessageScrollMetrics | null {
  const viewport = getScrollViewport()
  return viewport ? toScrollMetrics(viewport) : null
}

function captureScrollAnchor(): ChatMessageScrollAnchor | null {
  const viewport = getScrollViewport()
  const metrics = readScrollMetrics()
  if (!viewport || !metrics)
    return null
  const viewportTop = viewport.getBoundingClientRect().top
  const message = [...root.value?.querySelectorAll<HTMLElement>('[data-message-id]') ?? []]
    .find(element => element.getBoundingClientRect().bottom > viewportTop)
  if (!message?.dataset.messageId)
    return null
  return {
    messageId: message.dataset.messageId,
    messageOffsetTop: message.getBoundingClientRect().top - viewportTop,
    metrics,
  }
}

async function restoreScrollAnchor(anchor: ChatMessageScrollAnchor): Promise<void> {
  cancelTailScroll()
  let foundAnchor = false
  let stableFrames = 0
  for (let pass = 0; pass < 24; pass += 1) {
    const viewport = getScrollViewport()
    const anchorMessage = [...root.value?.querySelectorAll<HTMLElement>('[data-message-id]') ?? []]
      .find(element => element.dataset.messageId === anchor.messageId)
      ?? null
    if (viewport && anchorMessage) {
      foundAnchor = true
      const currentOffset = anchorMessage.getBoundingClientRect().top
        - viewport.getBoundingClientRect().top
      const offsetDelta = currentOffset - anchor.messageOffsetTop
      if (Math.abs(offsetDelta) <= 1) {
        stableFrames += 1
        if (stableFrames >= 3)
          return
      }
      else {
        stableFrames = 0
        applyVirtualScroll({
          debounce: false,
          top: viewport.scrollTop + offsetDelta,
        })
      }
    }
    else {
      stableFrames = 0
      applyVirtualScroll({ debounce: false, key: `message:${anchor.messageId}` })
    }
    await nextTick()
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  }
  if (!foundAnchor) {
    const metrics = readScrollMetrics()
    if (metrics)
      applyVirtualScroll({ debounce: false, top: resolvePrependedChatScrollTop(anchor.metrics, metrics) })
  }
}

async function scrollToTail(): Promise<void> {
  const generation = ++tailScrollGeneration
  activeTailScrollGeneration = generation
  let previousScrollHeight = -1
  let stableFrames = 0
  try {
    for (let pass = 0; pass < 18; pass += 1) {
      if (generation !== tailScrollGeneration)
        return
      applyVirtualScroll({ debounce: false, position: 'bottom' })
      await nextTick()
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      const metrics = readScrollMetrics()
      if (!metrics)
        return
      const isStable = metrics.scrollHeight === previousScrollHeight
        && metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= 1
      stableFrames = isStable ? stableFrames + 1 : 0
      if (stableFrames >= 2)
        return
      previousScrollHeight = metrics.scrollHeight
    }
  }
  finally {
    if (activeTailScrollGeneration === generation)
      activeTailScrollGeneration = null
  }
}

async function scrollToMessage(messageId: string): Promise<void> {
  cancelTailScroll()
  applyVirtualScroll({
    debounce: false,
    key: `message:${messageId}`,
    position: 'top',
  })
  await nextTick()
}

function cancelTailScroll() {
  tailScrollGeneration += 1
  activeTailScrollGeneration = null
}

function applyVirtualScroll(options: VirtualScrollOptions) {
  virtualList.value?.scrollTo(options)
  getScrollViewport()?.dispatchEvent(new Event('scroll'))
}

defineExpose<BuddyChatMessageListHandle>({
  cancelTailScroll,
  captureScrollAnchor,
  restoreScrollAnchor,
  scrollToMessage,
  scrollToTail,
})

onBeforeUnmount(() => {
  if (scrollFrame !== null)
    cancelAnimationFrame(scrollFrame)
})

function toScrollMetrics(viewport: HTMLElement): ChatMessageScrollMetrics {
  return {
    clientHeight: viewport.clientHeight,
    scrollHeight: viewport.scrollHeight,
    scrollTop: viewport.scrollTop,
  }
}
</script>

<template>
  <div
    ref="root"
    aria-live="polite"
    class="buddy-chat-message-list"
    role="log"
    @pointerdown="cancelTailScroll"
  >
    <div
      v-if="isLoadingOlderMessages"
      class="buddy-chat-message-list__history-status"
      role="status"
    >
      {{ t('desktop.chat.loadingOlder') }}
    </div>
    <NVirtualList
      ref="virtualList"
      class="buddy-chat-message-list__virtual"
      :item-size="96"
      item-resizable
      :items="virtualRows"
      key-field="key"
      :padding-bottom="16"
      :padding-top="hasOlderMessages ? 32 : 24"
      @scroll="handleVirtualScroll"
      @wheel="cancelTailScroll"
    >
      <template #default="{ item }">
        <div
          v-if="item.kind === 'day-divider'"
          class="buddy-chat-day-divider buddy-chat-virtual-row"
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
          class="buddy-chat-virtual-row"
          :editing="isEditingMessage(item.message)"
          :language="language"
          :message="item.message"
          :search-match="matchingSearchMessageIds.has(item.message.id)"
          :show-assistant-identity="showAssistantIdentity(item.message)"
          @activate-branch="emit('activateBranch', $event)"
          @cancel-edit="cancelEditingMessage"
          @edit="submitEditedMessage(item.message, $event)"
          @regenerate="emit('regenerateAssistant', item.message.id)"
          @start-edit="startEditingMessage(item.message)"
        />

        <BuddyChatAgentTurn
          v-else-if="item.kind === 'agent-turn'"
          class="buddy-chat-virtual-row"
          :language="language"
          :open="isAgentTurnOpen(item.turn)"
          :turn="item.turn"
          @toggle="toggleAgentTurn(item.turn)"
        />

        <article
          v-else-if="item.kind === 'streaming'"
          class="buddy-chat-streaming buddy-chat-virtual-row"
          :class="{ 'has-activity-tail': transcriptProjection.hasActiveProcessIdentity }"
        >
          <BuddyChatAgentIdentity v-if="!transcriptProjection.hasActiveProcessIdentity" :language="language" />
          <div
            v-if="item.message.text"
            class="buddy-chat-streaming__content"
            v-html="renderChatMarkdown(item.message.text)"
          />
        </article>

        <BuddyChatRunActivity
          v-else-if="item.kind === 'activity'"
          class="buddy-chat-virtual-row"
          :language="language"
          :turn="item.turn"
        />

        <div
          v-else-if="item.kind === 'recovery-notice'"
          class="buddy-chat-system-event buddy-chat-virtual-row is-warning"
          role="status"
        >
          <span>{{ recoveryNoticeLabel(item.notice) }}</span>
        </div>

        <div
          v-else-if="item.kind === 'compaction'"
          class="buddy-chat-system-event buddy-chat-virtual-row"
          :data-compaction-id="item.compaction.id"
        >
          <span>{{ compactionLabel(item.compaction) }}</span>
          <small v-if="compactionTokenLabel(item.compaction)">
            {{ compactionTokenLabel(item.compaction) }}
          </small>
        </div>
      </template>
    </NVirtualList>
  </div>
</template>

<style scoped lang="scss">
.buddy-chat-message-list {
  position: relative;
  min-width: 0;
  min-height: 0;
}

.buddy-chat-message-list__virtual {
  height: 100%;

  :deep(.v-vl) {
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }
}

.buddy-chat-message-list__history-status {
  position: absolute;
  z-index: 2;
  top: 0.45rem;
  left: 50%;
  border: 1px solid var(--buddy-border-light);
  border-radius: var(--buddy-radius-micro);
  background: var(--buddy-bg-surface-raised);
  color: var(--buddy-text-secondary);
  font-size: 0.68rem;
  padding: 0.25rem 0.6rem;
  pointer-events: none;
  transform: translateX(-50%);
}

.buddy-chat-virtual-row {
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

.buddy-chat-agent-turn.buddy-chat-virtual-row {
  padding-bottom: var(--buddy-chat-gap-block);
}

.buddy-chat-day-divider {
  display: flex;
  justify-content: center;
  color: var(--buddy-text-placeholder);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  line-height: 1.25rem;
  padding-block: 0.75rem 1.25rem;
}

.buddy-chat-agent-turn.has-visible-process.buddy-chat-virtual-row {
  padding-bottom: var(--buddy-chat-gap-section);
}

.buddy-chat-streaming {
  display: grid;
  align-items: start;
  gap: var(--buddy-chat-gap-block);
  padding-bottom: var(--buddy-chat-gap-turn);

  &.has-activity-tail {
    padding-bottom: var(--buddy-chat-gap-block);
  }
}

.buddy-chat-streaming__content {
  max-width: 100%;
  color: var(--buddy-text-regular);
  line-height: 1.7;
  padding: 0.05rem 0;
  overflow-wrap: anywhere;

  :deep(> :first-child) {
    margin-top: 0;
  }

  :deep(> :last-child) {
    margin-bottom: 0;
  }

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
    background: var(--buddy-border-light);
    content: '';
  }

  small {
    color: var(--buddy-text-tertiary);
    font-size: 0.65rem;
  }

  &.is-warning {
    color: var(--buddy-accent-warning);

    &::before,
    &::after {
      background: color-mix(in srgb, var(--buddy-accent-warning) 42%, var(--buddy-border-light));
    }
  }
}
</style>
