<script setup lang="ts">
import type {
  LocalConversationBranch,
  LocalConversationTimelineItem,
  LocalMessage,
  LocalRun,
  LocalRunEvent,
} from '../../electron/shared/localChatApi'
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
  ChatRecoveryNotice,
  StreamingAssistantMessage,
} from './chatStreamingMessage'
import type { ChatTimelineRow } from './chatTimelineProjection'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { NButton, NInput, NTooltip, NVirtualList, useMessage } from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'
import DesktopIcon from '@/desktop/DesktopIcon.vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import BuddyChatAgentIdentity from './BuddyChatAgentIdentity.vue'
import BuddyChatAgentTurn from './BuddyChatAgentTurn.vue'
import BuddyChatMessageContent from './BuddyChatMessageContent.vue'
import { resolveChatAgentTurnOpen } from './chatAgentTurnDisclosure'
import {
  projectConversationCompaction,
} from './chatConversationTimeline'
import { renderChatMarkdown } from './chatMarkdown'
import { projectChatMessageActions } from './chatMessageActions'
import { projectChatMessageBranchNavigators } from './chatMessageBranches'
import {
  getChatMessageInterruption,
  getChatMessageText,
} from './chatMessageContent'
import { resolvePrependedChatScrollTop } from './chatMessageViewport'
import {
  projectChatAgentTurns,
  projectChatRecoveryNotices,
  projectStreamingAssistantMessage,
} from './chatStreamingMessage'
import { projectChatTimelineRows } from './chatTimelineProjection'

interface StreamingVirtualRow {
  key: string
  kind: 'streaming'
  message: StreamingAssistantMessage
}

interface RecoveryNoticeVirtualRow {
  key: string
  kind: 'recovery-notice'
  notice: ChatRecoveryNotice
}

type ChatVirtualRow
  = | ChatTimelineRow
    | RecoveryNoticeVirtualRow
    | StreamingVirtualRow

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
const message = useMessage()
const root = useTemplateRef<HTMLDivElement>('root')
const virtualList = useTemplateRef<VirtualListHandle>('virtualList')
const scrollViewport = shallowRef<HTMLElement | null>(null)
const agentTurnOpenOverrides = shallowRef<ReadonlyMap<string, boolean>>(new Map())
const copiedMessageId = shallowRef<string | null>(null)
const editingMessageId = shallowRef<string | null>(null)
const editingText = shallowRef('')
let scrollFrame: number | null = null
let copiedResetTimer: number | null = null
let activeTailScrollGeneration: number | null = null
let tailScrollGeneration = 0
const messages = computed<ReadonlyArray<LocalMessage>>(() => props.timelineItems.filter(
  (item): item is Extract<LocalConversationTimelineItem, { kind: 'message' }> =>
    item.kind === 'message',
))
const matchingSearchMessageIds = computed(() => new Set(props.matchingSearchMessageIds ?? []))
const conversationId = computed(() => props.timelineItems[0]?.conversationId ?? null)
const streamingMessage = computed(() => projectStreamingAssistantMessage(
  messages.value,
  props.runEvents ?? [],
  props.runs ?? [],
))
const recoveryNotices = computed(() => projectChatRecoveryNotices(
  props.timelineItems,
  props.runEvents ?? [],
  props.runs ?? [],
))
const agentTurns = computed(() => projectChatAgentTurns(
  props.runEvents ?? [],
  props.runs ?? [],
))
const virtualRows = computed<ChatVirtualRow[]>(() => {
  const triggeringMessageIdByRunId = new Map(
    (props.runs ?? []).map(run => [run.id, run.triggeringMessageId]),
  )
  const noticesByMessageId = new Map<string, RecoveryNoticeVirtualRow[]>()
  const noticesByRunId = new Map<string, RecoveryNoticeVirtualRow[]>()
  for (const notice of recoveryNotices.value) {
    const messageId = triggeringMessageIdByRunId.get(notice.runId)
    if (!messageId)
      continue
    const rows = noticesByMessageId.get(messageId) ?? []
    rows.push({
      key: `recovery-notice:${notice.runId}:${notice.sequence}`,
      kind: 'recovery-notice',
      notice,
    })
    noticesByMessageId.set(messageId, rows)
    const runRows = noticesByRunId.get(notice.runId) ?? []
    runRows.push(rows.at(-1)!)
    noticesByRunId.set(notice.runId, runRows)
  }
  const agentTurnRunIds = new Set(agentTurns.value.map(turn => turn.runId))
  const rows: ChatVirtualRow[] = []
  for (const row of projectChatTimelineRows(props.timelineItems, agentTurns.value)) {
    rows.push(row)
    if (row.kind === 'agent-turn') {
      rows.push(...(noticesByRunId.get(row.turn.runId) ?? []))
      continue
    }
    if (row.kind === 'message') {
      rows.push(...(noticesByMessageId.get(row.message.id) ?? []).filter(
        notice => !agentTurnRunIds.has(notice.notice.runId),
      ))
    }
  }
  if (streamingMessage.value) {
    rows.push({
      key: `streaming:${streamingMessage.value.id}`,
      kind: 'streaming',
      message: streamingMessage.value,
    })
  }
  return rows
})
const processIdentityMessageIds = computed(() => new Set(virtualRows.value.flatMap(row => (
  row.kind === 'agent-turn' && row.turn.finalMessageId
    ? [row.turn.finalMessageId]
    : []
))))
const processIdentityRunIds = computed(() => new Set(virtualRows.value.flatMap(row => (
  row.kind === 'agent-turn' ? [row.turn.runId] : []
))))
const hasActiveProcessIdentity = computed(() => virtualRows.value.some(row => (
  row.kind === 'agent-turn'
  && (row.turn.status === 'queued' || row.turn.status === 'running')
)))
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

function messageHtml(message: LocalMessage): string {
  return renderChatMarkdown(getChatMessageText(message))
}

function shouldShowAssistantIdentity(message: LocalMessage): boolean {
  if (message.role !== 'assistant')
    return false
  return !processIdentityMessageIds.value.has(message.id)
    && (!message.runId || !processIdentityRunIds.value.has(message.runId))
}

function messageInterruptionLabel(message: LocalMessage): string | null {
  const interruption = getChatMessageInterruption(message)
  if (!interruption)
    return null
  return t(interruption.truncated
    ? 'desktop.chat.messageInterruptedTruncated'
    : 'desktop.chat.messageInterrupted')
}

function roleLabel(message: LocalMessage): string {
  return t(`message.role.${message.role}`)
}

function messageActions(message: LocalMessage) {
  return projectChatMessageActions(message, props.actionsDisabled ?? false)
}

function isEditingMessage(message: LocalMessage): boolean {
  return editingMessageId.value === message.id
}

function startEditingMessage(message: LocalMessage) {
  editingMessageId.value = message.id
  editingText.value = getChatMessageText(message)
}

function cancelEditingMessage() {
  editingMessageId.value = null
  editingText.value = ''
}

function submitEditedMessage(message: LocalMessage) {
  const content = editingText.value.trim()
  if (!content && !message.attachments.length)
    return
  emit('editUserMessage', message.id, content)
  cancelEditingMessage()
}

async function copyMessage(messageToCopy: LocalMessage) {
  const text = getChatMessageText(messageToCopy)
  if (!text)
    return
  try {
    await navigator.clipboard.writeText(text)
    copiedMessageId.value = messageToCopy.id
    if (copiedResetTimer !== null)
      window.clearTimeout(copiedResetTimer)
    copiedResetTimer = window.setTimeout(() => {
      copiedMessageId.value = null
      copiedResetTimer = null
    }, 1_400)
  }
  catch {
    message.error(t('desktop.chat.copyFailed'))
  }
}

function recoveryNoticeLabel(notice: ChatRecoveryNotice): string {
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
  if (copiedResetTimer !== null)
    window.clearTimeout(copiedResetTimer)
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
        <article
          v-if="item.kind === 'message'"
          class="buddy-chat-message buddy-chat-virtual-row"
          :class="[
            `is-${item.message.role}`,
            {
              'is-search-active': item.message.id === activeSearchMessageId,
              'is-agent-turn-final': item.message.role === 'assistant' && !shouldShowAssistantIdentity(item.message),
              'is-editing': isEditingMessage(item.message),
              'is-search-match': matchingSearchMessageIds.has(item.message.id),
            },
          ]"
          :data-message-id="item.message.id"
        >
          <BuddyChatAgentIdentity
            v-if="shouldShowAssistantIdentity(item.message)"
            :language="language"
          />
          <span
            v-else-if="item.message.role !== 'user' && item.message.role !== 'assistant'"
            class="buddy-chat-message__role"
          >
            {{ roleLabel(item.message) }}
          </span>
          <div v-if="isEditingMessage(item.message)" class="buddy-chat-message__editor">
            <NInput
              v-model:value="editingText"
              :autosize="{ minRows: 2, maxRows: 10 }"
              :disabled="messageActions(item.message).disabled"
              type="textarea"
            />
            <div class="buddy-chat-message__editor-actions">
              <NButton size="small" @click="cancelEditingMessage">
                {{ t('common.cancel') }}
              </NButton>
              <NButton
                :disabled="(!editingText.trim() && !item.message.attachments.length) || messageActions(item.message).disabled"
                size="small"
                type="primary"
                @click="submitEditedMessage(item.message)"
              >
                {{ t('desktop.chat.saveEdit') }}
              </NButton>
            </div>
          </div>
          <BuddyChatMessageContent
            v-else
            class="buddy-chat-message__body"
            :html="messageHtml(item.message)"
            :language="language"
            :message="item.message"
          />
          <small
            v-if="messageInterruptionLabel(item.message)"
            class="buddy-chat-message__interruption"
            role="status"
          >
            {{ messageInterruptionLabel(item.message) }}
          </small>
          <div v-if="!isEditingMessage(item.message)" class="buddy-chat-message__actions">
            <NTooltip v-if="messageActions(item.message).showCopy" placement="bottom">
              <template #trigger>
                <NButton
                  class="buddy-icon-button"
                  quaternary
                  size="tiny"
                  :aria-label="t(copiedMessageId === item.message.id ? 'desktop.chat.copied' : 'desktop.chat.copy')"
                  @click="copyMessage(item.message)"
                >
                  <template #icon>
                    <DesktopIcon :name="copiedMessageId === item.message.id ? 'messageCopied' : 'messageCopy'" />
                  </template>
                </NButton>
              </template>
              {{ t(copiedMessageId === item.message.id ? 'desktop.chat.copied' : 'desktop.chat.copy') }}
            </NTooltip>
            <NTooltip v-if="messageActions(item.message).showEdit" placement="bottom">
              <template #trigger>
                <NButton
                  :data-testid="`edit-message-${item.message.id}`"
                  :disabled="messageActions(item.message).disabled"
                  class="buddy-icon-button"
                  quaternary
                  size="tiny"
                  :aria-label="t('desktop.chat.editMessage')"
                  @click="startEditingMessage(item.message)"
                >
                  <template #icon>
                    <DesktopIcon name="messageEdit" />
                  </template>
                </NButton>
              </template>
              {{ t('desktop.chat.editMessage') }}
            </NTooltip>
            <NTooltip v-if="messageActions(item.message).showRegenerate" placement="bottom">
              <template #trigger>
                <NButton
                  :data-testid="`regenerate-message-${item.message.id}`"
                  :disabled="messageActions(item.message).disabled"
                  class="buddy-icon-button"
                  quaternary
                  size="tiny"
                  :aria-label="t('desktop.chat.regenerate')"
                  @click="emit('regenerateAssistant', item.message.id)"
                >
                  <template #icon>
                    <DesktopIcon name="messageRetry" />
                  </template>
                </NButton>
              </template>
              {{ t('desktop.chat.regenerate') }}
            </NTooltip>
            <div
              v-if="branchNavigators.get(item.message.id)"
              class="buddy-chat-message__branch"
            >
              <NTooltip placement="bottom">
                <template #trigger>
                  <NButton
                    :disabled="messageActions(item.message).disabled || !branchNavigators.get(item.message.id)?.previousBranchId"
                    class="buddy-icon-button buddy-chat-message__branch-button"
                    quaternary
                    size="tiny"
                    :aria-label="t('desktop.chat.previousBranch')"
                    @click="emit('activateBranch', branchNavigators.get(item.message.id)!.previousBranchId!)"
                  >
                    <template #icon>
                      <DesktopIcon name="messageBranchPrevious" />
                    </template>
                  </NButton>
                </template>
                {{ t('desktop.chat.previousBranch') }}
              </NTooltip>
              <span>
                {{ branchNavigators.get(item.message.id)!.index }} / {{ branchNavigators.get(item.message.id)!.count }}
              </span>
              <NTooltip placement="bottom">
                <template #trigger>
                  <NButton
                    :disabled="messageActions(item.message).disabled || !branchNavigators.get(item.message.id)?.nextBranchId"
                    class="buddy-icon-button buddy-chat-message__branch-button"
                    quaternary
                    size="tiny"
                    :aria-label="t('desktop.chat.nextBranch')"
                    @click="emit('activateBranch', branchNavigators.get(item.message.id)!.nextBranchId!)"
                  >
                    <template #icon>
                      <DesktopIcon name="messageBranchNext" />
                    </template>
                  </NButton>
                </template>
                {{ t('desktop.chat.nextBranch') }}
              </NTooltip>
            </div>
          </div>
        </article>

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
          class="buddy-chat-message buddy-chat-virtual-row is-assistant is-streaming"
        >
          <BuddyChatAgentIdentity v-if="!hasActiveProcessIdentity" :language="language" />
          <div
            v-if="item.message.text"
            class="buddy-chat-message__content"
            v-html="renderChatMarkdown(item.message.text)"
          />
          <div v-else class="buddy-chat-activity" role="status">
            <i />
            <span>{{ t('desktop.chat.activity') }}</span>
          </div>
        </article>

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
  padding: 0 var(--buddy-chat-inline-gutter) 1rem;
}

.buddy-chat-agent-turn.buddy-chat-virtual-row {
  padding-bottom: var(--buddy-chat-gap-block);
}

.buddy-chat-agent-turn.has-visible-process.buddy-chat-virtual-row {
  padding-bottom: var(--buddy-chat-gap-section);
}

.buddy-chat-message.is-agent-turn-final {
  row-gap: var(--buddy-chat-gap-tight);
}

.buddy-chat-message {
  position: relative;
  display: grid;
  gap: var(--buddy-chat-gap-block);
  padding-bottom: var(--buddy-chat-gap-turn);

  &.is-user {
    justify-items: end;
  }

  &.is-editing {
    justify-items: stretch;
  }

  &.is-assistant,
  &.is-streaming {
    align-items: start;
  }

  &.is-tool {
    color: var(--buddy-text-secondary);
    font-size: 0.75rem;
  }
}

.buddy-chat-message__editor {
  display: grid;
  width: 100%;
  gap: 0.65rem;
  border: 1px solid color-mix(in srgb, var(--buddy-accent-primary) 32%, var(--buddy-border-light));
  border-radius: 0.75rem;
  background: var(--buddy-bg-surface-raised);
  padding: 0.75rem;

  :deep(.n-input) {
    --n-border: 0 !important;
    --n-border-hover: 0 !important;
    --n-border-focus: 0 !important;
    --n-box-shadow-focus: none !important;
    background: transparent;
  }
}

.buddy-chat-message__editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.45rem;
}

.buddy-chat-message__role {
  display: grid;
  width: var(--buddy-chat-avatar-size);
  min-height: var(--buddy-chat-avatar-size);
  place-items: center;
  color: var(--buddy-text-placeholder);
  font-size: 0.65rem;
  font-weight: 650;

  img {
    width: var(--buddy-chat-avatar-size);
    height: var(--buddy-chat-avatar-size);
    border-radius: 0.45rem;
  }
}

.buddy-chat-message__content {
  max-width: min(42rem, 92%);
  border-radius: 0.9rem;
  background: var(--buddy-bg-surface-raised);
  color: var(--buddy-text-regular);
  line-height: 1.7;
  padding: 0.75rem 0.95rem;
  overflow-wrap: anywhere;

  :deep(> :first-child) {
    margin-top: 0;
  }

  :deep(> :last-child) {
    margin-bottom: 0;
  }

  .is-user & {
    background: color-mix(in srgb, var(--buddy-accent-primary) 13%, var(--buddy-bg-surface));
  }

  .is-assistant &,
  .is-streaming & {
    max-width: 100%;
    border-radius: 0;
    background: transparent;
    padding: 0.05rem 0;
  }

  .is-tool & {
    max-width: 100%;
    border-radius: 0;
    background: transparent;
    color: var(--buddy-text-secondary);
    font-size: 0.75rem;
    padding: 0;
  }
}

.buddy-chat-message.is-search-match :deep(.buddy-chat-message-content__text) {
  border-radius: 0.6rem;
  background: color-mix(in srgb, var(--buddy-accent-warning) 8%, var(--buddy-bg-surface-raised));
  box-shadow: inset 2px 0 color-mix(in srgb, var(--buddy-accent-warning) 62%, var(--buddy-border-light));
}

.buddy-chat-message.is-search-active :deep(.buddy-chat-message-content__text) {
  outline: 1px solid color-mix(in srgb, var(--buddy-accent-warning) 55%, var(--buddy-border-light));
  outline-offset: 1px;
}

.buddy-chat-message.is-assistant.is-search-match :deep(.buddy-chat-message-content__text) {
  width: fit-content;
  max-width: 100%;
  justify-self: start;
  padding: 0.35rem 0.55rem;
}

.buddy-chat-message__interruption {
  max-width: min(42rem, 92%);
  color: var(--buddy-text-secondary);
  font-size: 0.75rem;
  line-height: 1.5;
}

.buddy-chat-message__actions {
  position: absolute;
  bottom: var(--buddy-chat-gap-tight);
  left: var(--buddy-chat-inline-gutter);
  display: flex;
  min-height: 1.5rem;
  align-items: center;
  gap: 0.15rem;
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;

  .buddy-chat-message:hover &,
  .buddy-chat-message:focus-within & {
    opacity: 1;
    pointer-events: auto;
  }

  .is-user & {
    right: var(--buddy-chat-inline-gutter);
    left: auto;
    justify-content: flex-end;
  }

  :deep(.n-button) {
    color: var(--buddy-text-secondary);
    font-size: 0.68rem;
  }
}

.buddy-chat-message__branch {
  display: inline-flex;
  align-items: center;
  gap: 0.05rem;
  margin-left: 0.1rem;
  color: var(--buddy-text-secondary);
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;

  > span {
    min-width: 2.25rem;
    text-align: center;
  }
}

.buddy-chat-message__branch-button {
  width: 1.35rem;
  min-width: 1.35rem;
  height: 1.35rem;
  border-radius: var(--buddy-icon-button-radius);
  padding: 0;

  :deep(.n-button__icon) {
    font-size: 1rem;
  }
}

@media (hover: none) {
  .buddy-chat-message__actions {
    opacity: 1;
    pointer-events: auto;
  }
}

.buddy-chat-activity {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--buddy-text-secondary);
  font-size: 0.7rem;

  i {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: var(--buddy-accent-primary);
    animation: buddy-activity-pulse 1.3s ease-in-out infinite;
  }
}

.buddy-chat-system-event {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  color: var(--buddy-text-secondary);
  font-size: 0.7rem;

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

@keyframes buddy-activity-pulse {
  50% { opacity: 0.35; }
}

@media (prefers-reduced-motion: reduce) {
  .buddy-chat-activity i {
    animation: none;
  }
}
</style>
