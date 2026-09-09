<script setup lang="ts">
import type { LocalArtifact } from '@buddy-shared/artifacts/artifactApi'
import type { BuddyPromptDirective } from '@buddy-shared/conversation/buddyUserContent'

import type { LocalMessage } from '@buddy-shared/conversation/conversationApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { buddyPromptDirectiveToText, getBuddyUserContentResourceIds } from '@buddy-shared/conversation/buddyUserContent'
import { computed, nextTick, shallowRef, useTemplateRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { FileIcon } from '@/shared/ui/file-icon'
import BuddyImagePreview from '@/shared/ui/media/BuddyImagePreview.vue'
import { resolveBuddyAttachmentPreviewUrl } from '../../model/attachments/chatAttachmentView'
import { getChatMessageDisplayText, getChatMessageUserContent } from '../../model/transcript/chatMessageContent'
import ResourceReferenceBadge from '../attachments/ResourceReferenceBadge.vue'
import { useResourceHighlight } from '../attachments/useResourceHighlight'
import ChatQuoteStrip from '../quotes/ChatQuoteStrip.vue'
import BuddyChatMarkdownContent from './BuddyChatMarkdownContent.vue'
import BuddyChatResourceReference from './BuddyChatResourceReference.vue'

const props = withDefaults(defineProps<{
  final?: boolean
  hiddenArtifacts?: readonly LocalArtifact[]
  language: BuddyLocale
  message: LocalMessage
  writeClipboardText: (text: string) => Promise<void>
}>(), {
  final: true,
  hiddenArtifacts: () => [],
})

const { t } = useBuddyI18n(() => props.language)
const attachmentTrack = useTemplateRef<HTMLDivElement>('attachmentTrack')
const { highlightedResourceId, highlightResource } = useResourceHighlight(attachmentTrack)
const failedAttachmentIds = shallowRef<ReadonlySet<string>>(new Set())
const previewIndex = shallowRef(0)
const previewOpen = shallowRef(false)
let previewTrackScrollLeft = 0
const text = computed(() => getChatMessageDisplayText(
  props.message,
  props.hiddenArtifacts,
))
const hasText = computed(() => text.value.trim().length > 0)
const structuredUserContent = computed(() => getChatMessageUserContent(props.message))
const allAttachmentViews = computed(() => props.message.attachments.map(attachment => ({
  attachment,
  isReference: false,
  previewUrl: resolveBuddyAttachmentPreviewUrl(attachment),
  resourceId: attachment.attachmentId,
})))
const attachmentByResourceId = computed(() => {
  const attachmentsById = new Map(
    props.message.attachments.map(attachment => [attachment.attachmentId, attachment]),
  )
  return new Map(structuredUserContent.value?.resourceSnapshots.flatMap((snapshot) => {
    const attachment = attachmentsById.get(snapshot.attachmentId)
    return attachment ? [[snapshot.resourceId, attachment] as const] : []
  }) ?? [])
})
const attachmentViews = computed(() => {
  const structured = structuredUserContent.value
  if (!structured)
    return allAttachmentViews.value
  const panelIds = new Set(structured.userContent.panelResourceIds)
  return [...new Set([...panelIds, ...getBuddyUserContentResourceIds(structured.userContent)])].flatMap((resourceId) => {
    const attachment = attachmentByResourceId.value.get(resourceId)
    return attachment
      ? [{ attachment, isReference: !panelIds.has(resourceId), previewUrl: resolveBuddyAttachmentPreviewUrl(attachment), resourceId }]
      : []
  })
})
const previewableAttachmentViews = computed(() => allAttachmentViews.value.filter(view => (
  view.previewUrl && !failedAttachmentIds.value.has(view.attachment.attachmentId)
)))
const previewSources = computed(() => previewableAttachmentViews.value.flatMap(
  view => view.previewUrl ? [view.previewUrl] : [],
))

function markPreviewFailed(attachmentId: string) {
  failedAttachmentIds.value = new Set([...failedAttachmentIds.value, attachmentId])
}

function openPreview(attachmentId: string) {
  const index = previewableAttachmentViews.value.findIndex(
    view => view.attachment.attachmentId === attachmentId,
  )
  if (index < 0)
    return
  previewTrackScrollLeft = attachmentTrack.value?.scrollLeft ?? 0
  previewIndex.value = index
  previewOpen.value = true
}

function directiveText(directive: BuddyPromptDirective): string {
  return buddyPromptDirectiveToText(directive)
}

async function updatePreviewOpen(open: boolean) {
  previewOpen.value = open
  if (open)
    return
  await nextTick()
  await previewLeaveTransition()
  attachmentTrack.value?.scrollTo({ left: previewTrackScrollLeft })
}

function previewLeaveTransition(): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, 320))
}
</script>

<template>
  <div
    class="buddy-chat-message-content"
    :class="`is-${message.role}`"
    :data-quote-source="message.role === 'user' || message.role === 'assistant' ? JSON.stringify({ conversationId: message.conversationId, branchId: message.branchId, messageId: message.id, runId: message.runId, role: message.role }) : undefined"
  >
    <BuddyImagePreview
      v-model:current="previewIndex"
      v-model:show="previewOpen"
      :language="language"
      :sources="previewSources"
      @update:show="updatePreviewOpen"
    />
    <ChatQuoteStrip :quotes="structuredUserContent?.userContent.quotes ?? []" :language="language" />
    <div
      v-if="attachmentViews.length"
      ref="attachmentTrack"
      class="buddy-chat-message-content__attachments"
    >
      <figure
        v-for="view in attachmentViews"
        :key="view.resourceId"
        class="buddy-chat-message-content__attachment"
        :class="{ 'is-highlighted': highlightedResourceId === view.resourceId }"
        :data-resource-card="view.resourceId"
        @click="openPreview(view.attachment.attachmentId)"
      >
        <ResourceReferenceBadge v-if="view.isReference" :language="language" />
        <button
          v-if="view.previewUrl && !failedAttachmentIds.has(view.attachment.attachmentId)"
          class="buddy-chat-message-content__preview-trigger"
          type="button"
          :aria-label="t('desktop.imagePreview.open', { name: view.attachment.name })"
          @click.stop="openPreview(view.attachment.attachmentId)"
        >
          <img
            :src="view.previewUrl"
            :alt="view.attachment.name"
            height="112"
            loading="lazy"
            width="160"
            @error="markPreviewFailed(view.attachment.attachmentId)"
          >
        </button>
        <div v-else class="buddy-chat-message-content__file">
          <FileIcon :name="view.attachment.name" size="preview" />
          <span>{{ view.attachment.name }}</span>
          <small>{{ view.attachment.kind === 'text' ? 'TXT' : 'FILE' }}</small>
        </div>
        <figcaption
          v-if="view.previewUrl && !failedAttachmentIds.has(view.attachment.attachmentId)"
        >
          {{ view.attachment.name }}
        </figcaption>
      </figure>
    </div>
    <div
      v-if="structuredUserContent && hasText"
      class="buddy-chat-message-content__text buddy-chat-message-content__structured-body"
    >
      <p
        v-for="(paragraph, paragraphIndex) in structuredUserContent.userContent.body"
        :key="paragraphIndex"
      >
        <template v-for="(node, nodeIndex) in paragraph.content" :key="nodeIndex">
          <span v-if="node.type === 'text'">{{ node.text }}</span>
          <br v-else-if="node.type === 'hard_break'">
          <span
            v-else-if="node.type === 'prompt_directive'"
            class="buddy-chat-message-content__directive"
          >{{ directiveText(node) }}</span>
          <BuddyChatResourceReference
            v-else-if="attachmentByResourceId.get(node.resourceId)"
            :attachment="attachmentByResourceId.get(node.resourceId)!"
            :language="language"
            :resource-id="node.resourceId"
            @locate="highlightResource"
          />
        </template>
      </p>
    </div>
    <div
      v-else-if="hasText && message.role === 'user'"
      class="buddy-chat-message-content__text is-plain-text"
    >
      {{ text }}
    </div>
    <BuddyChatMarkdownContent
      v-else-if="hasText"
      class="buddy-chat-message-content__text"
      :content="text"
      :final="final"
      :language="language"
      :write-clipboard-text="writeClipboardText"
    />
  </div>
</template>

<style scoped lang="scss">
.buddy-chat-message-content {
  display: grid;
  width: fit-content;
  max-width: min(42rem, 92%);
  min-width: 0;
  gap: 0.45rem;
  background: transparent;
  padding: 0;

  &.is-user {
    justify-items: end;
  }

  &.is-assistant,
  &.is-tool {
    width: 100%;
    max-width: 100%;
    justify-items: start;
  }
}

.buddy-chat-message-content__attachments {
  display: flex;
  width: 100%;
  max-width: 100%;
  flex-wrap: nowrap;
  gap: 0.45rem;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  padding-bottom: 0.25rem;
  scrollbar-color: transparent transparent;
  scrollbar-width: thin;

  &:hover {
    scrollbar-color: var(--buddy-border-strong) transparent;
  }

  &::-webkit-scrollbar {
    height: 6px;
  }

  &::-webkit-scrollbar-thumb {
    border-radius: 3px;
    background: transparent;
  }

  &:hover::-webkit-scrollbar-thumb {
    background: var(--buddy-border-strong);
  }
}

.buddy-chat-message-content__attachment {
  position: relative;
  display: grid;
  width: min(10rem, 100%);
  flex: 0 0 10rem;
  gap: 0.2rem;
  margin: 0;

  > .resource-reference-badge {
    position: absolute;
    top: 0.35rem;
    left: 0.35rem;
    z-index: 1;
    pointer-events: none;
  }

  &.is-highlighted {
    .buddy-chat-message-content__preview-trigger,
    .buddy-chat-message-content__file {
      border-color: var(--buddy-focus-ring);
      box-shadow: inset 0 0 0 2px var(--buddy-focus-ring);
      outline: 2px solid var(--buddy-focus-ring);
      outline-offset: -2px;
    }

    figcaption {
      color: var(--buddy-accent-on-surface);
    }
  }

  .buddy-chat-message-content__preview-trigger,
  .buddy-chat-message-content__file {
    box-sizing: border-box;
    width: 10rem;
    max-width: 100%;
    height: 7rem;
    border: 1px solid var(--buddy-border-subtle);
    border-radius: 0.65rem;
    background: var(--buddy-surface-raised);
  }

  figcaption {
    width: 100%;
    min-width: 0;
    overflow: hidden;
    color: var(--buddy-text-secondary);
    font-size: var(--buddy-chat-caption-font-size);
    line-height: var(--buddy-chat-caption-line-height);
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.buddy-chat-message-content.is-user .buddy-chat-message-content__attachment:first-child {
  margin-inline-start: auto;
}

.buddy-chat-message-content__preview-trigger {
  display: block;
  overflow: hidden;
  border: 0;
  cursor: zoom-in;
  padding: 0;

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 120ms ease;
  }

  &:hover img {
    transform: scale(1.025);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: 2px;
  }
}

.buddy-chat-message-content__file {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.45rem;
  color: var(--buddy-text-secondary);
  padding: 0.65rem;

  span {
    overflow: hidden;
    color: var(--buddy-text-primary);
    font-size: var(--buddy-chat-meta-font-size);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    color: var(--buddy-text-muted);
    font-size: 0.62rem;
    font-weight: 700;
  }
}

.buddy-chat-message-content__text {
  width: fit-content;
  max-width: 100%;
  min-width: 0;
  border-radius: 0.9rem;
  background: var(--buddy-surface-raised);
  color: var(--buddy-text-primary);
  line-height: 1.7;
  padding: 0.75rem 0.95rem;
  overflow-wrap: anywhere;

  &.is-plain-text {
    white-space: pre-wrap;
  }

  .is-user & {
    justify-self: end;
    background: var(--buddy-user-message-surface);
  }

  .is-assistant &,
  .is-tool & {
    width: 100%;
    border-radius: 0;
    background: transparent;
    padding: 0.05rem 0;
  }

  .is-tool & {
    color: var(--buddy-text-secondary);
    font-size: 0.75rem;
  }

  :deep(> :first-child) {
    margin-top: 0;
  }

  :deep(> :last-child) {
    margin-bottom: 0;
  }
}

.buddy-chat-message-content__structured-body {
  p {
    margin: 0;
    white-space: pre-wrap;

    & + p {
      margin-top: 0.35rem;
    }
  }
}

.buddy-chat-message-content__directive {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 0.25rem;
  border: 0;
  border-radius: var(--buddy-radius-micro);
  background: color-mix(in srgb, var(--buddy-accent-on-surface) 10%, transparent);
  color: inherit;
  font: inherit;
  line-height: 1.35;
  margin: 0 0.12rem;
  padding: 0.08rem 0.3rem;
  vertical-align: baseline;
}

@media (prefers-reduced-motion: reduce) {
  .buddy-chat-message-content__preview-trigger img {
    transition: none;
  }
}
</style>
