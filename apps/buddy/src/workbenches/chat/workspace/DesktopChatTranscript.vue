<script setup lang="ts">
import type {
  LocalChangeSetSummary,
  LocalConversationBranch,
  LocalConversationTimelineItem,
  LocalMessage,
  LocalRun,
  LocalRunOutput,
} from '@buddy-electron/shared/localChatApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { ChatRunEventBuckets } from '@/workbenches/chat/state/chatRunEventBuckets'
import type {
  BuddyChatMessageListHandle,
  ChatMessageScrollAnchor,
  ChatMessageScrollMetrics,
} from '@/workbenches/chat/transcript/chatMessageViewport'
import { computed, useTemplateRef } from 'vue'
import BuddyChatMessageList from '@/workbenches/chat/transcript/BuddyChatMessageList.vue'
import { createChatMessageBranchNavigatorProjector } from '@/workbenches/chat/transcript/chatMessageBranches'
import { createChatTranscriptDisplayRowProjector } from '@/workbenches/chat/transcript/chatMessageTime'
import { createChatRunTranscriptProjector } from '@/workbenches/chat/transcript/chatRunTranscriptProjector'
import { createChatTranscriptProjector } from '@/workbenches/chat/transcript/chatTranscriptProjection'
import { useConversationOutline } from './useConversationOutline'

const props = defineProps<{
  activeBranchId: string
  activeSearchMessageId: string | null
  actionsDisabled: boolean
  branches: ReadonlyArray<LocalConversationBranch>
  changeSets: ReadonlyArray<LocalChangeSetSummary>
  conversationId: string
  hasOlderMessages: boolean
  isLoadingOlderMessages: boolean
  language: BuddyLocale
  loadOutlineMessages: () => Promise<ReadonlyArray<LocalMessage>>
  matchingSearchMessageIds: ReadonlyArray<string>
  runEventBuckets: ChatRunEventBuckets
  runOutputs: ReadonlyArray<LocalRunOutput>
  runs: ReadonlyArray<LocalRun>
  showReturnToLatest: boolean
  timelineItems: ReadonlyArray<LocalConversationTimelineItem>
}>()

const emit = defineEmits<{
  activateBranch: [branchId: string]
  contentResize: [metrics: ChatMessageScrollMetrics]
  editUserMessage: [messageId: string, content: string]
  openArtifact: [artifactId: string]
  openChanges: [changeSetId: string]
  readerLayoutIntent: []
  regenerateAssistant: [sourceRunId: string]
  returnToLatest: []
  selectOutlineMessage: [messageId: string]
  scroll: [metrics: ChatMessageScrollMetrics]
}>()

const messageList = useTemplateRef<BuddyChatMessageListHandle>('messageList')
const activeBranchId = computed(() => props.activeBranchId)
const activeConversationId = computed(() => props.conversationId)
const runTranscriptProjector = createChatRunTranscriptProjector()
const transcriptProjector = createChatTranscriptProjector()
const displayRowProjector = createChatTranscriptDisplayRowProjector()
const branchNavigatorProjector = createChatMessageBranchNavigatorProjector()
const runProjections = computed(() => runTranscriptProjector.project(
  props.runEventBuckets,
  props.runs,
))
const transcriptProjection = computed(() => transcriptProjector.project({
  changeSets: props.changeSets,
  outputs: props.runOutputs,
  runProjections: runProjections.value,
  runs: props.runs,
  timelineItems: props.timelineItems,
}))
const displayRows = computed(() => displayRowProjector.project(transcriptProjection.value))
const branchNavigators = computed(() => branchNavigatorProjector.project(
  transcriptProjection.value,
  props.branches,
  props.activeBranchId,
))
const conversationOutline = useConversationOutline({
  activeBranchId,
  activeConversationId,
  loadMessages: props.loadOutlineMessages,
  transcriptProjection,
})

function captureScrollAnchor(): ChatMessageScrollAnchor | null {
  return messageList.value?.captureScrollAnchor() ?? null
}

function highlightMessage(messageId: string) {
  messageList.value?.highlightMessage(messageId)
}

function readScrollMetrics(): ChatMessageScrollMetrics | null {
  return messageList.value?.readScrollMetrics() ?? null
}

function restoreScrollAnchor(anchor: ChatMessageScrollAnchor): ChatMessageScrollMetrics | null {
  return messageList.value?.restoreScrollAnchor(anchor) ?? null
}

function scrollToMessage(
  messageId: string,
  behavior?: ScrollBehavior,
): ChatMessageScrollMetrics | null {
  return messageList.value?.scrollToMessage(messageId, behavior) ?? null
}

function scrollToTail(): ChatMessageScrollMetrics | null {
  return messageList.value?.scrollToTail() ?? null
}

defineExpose<BuddyChatMessageListHandle>({
  captureScrollAnchor,
  highlightMessage,
  readScrollMetrics,
  restoreScrollAnchor,
  scrollToMessage,
  scrollToTail,
})
</script>

<template>
  <BuddyChatMessageList
    ref="messageList"
    :active-branch-id="activeBranchId"
    :active-search-message-id="activeSearchMessageId"
    :actions-disabled="actionsDisabled"
    :branch-navigators="branchNavigators"
    :conversation-id="conversationId"
    :display-rows="displayRows"
    :has-older-messages="hasOlderMessages"
    :is-loading-older-messages="isLoadingOlderMessages"
    :language="language"
    :matching-search-message-ids="matchingSearchMessageIds"
    :outline-items="conversationOutline.items.value"
    :outline-loading="conversationOutline.isLoading.value"
    :show-return-to-latest="showReturnToLatest"
    @activate-branch="emit('activateBranch', $event)"
    @content-resize="emit('contentResize', $event)"
    @edit-user-message="(messageId, content) => emit('editUserMessage', messageId, content)"
    @open-artifact="emit('openArtifact', $event)"
    @open-changes="emit('openChanges', $event)"
    @prepare-outline="conversationOutline.prepare"
    @reader-layout-intent="emit('readerLayoutIntent')"
    @regenerate-assistant="emit('regenerateAssistant', $event)"
    @return-to-latest="emit('returnToLatest')"
    @select-outline-message="emit('selectOutlineMessage', $event)"
    @scroll="emit('scroll', $event)"
  />
</template>
