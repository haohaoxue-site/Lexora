<script setup lang="ts">
import type { LocalArtifact, LocalMessage } from '@buddy-electron/shared/localChatApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { computed, nextTick, shallowRef, useTemplateRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import BuddyFileIcon from '@/ui/files/BuddyFileIcon.vue'
import BuddyImagePreview from '@/ui/media/BuddyImagePreview.vue'
import BuddyChatMarkdownContent from './BuddyChatMarkdownContent.vue'
import { resolveBuddyAttachmentPreviewUrl } from './chatAttachmentView'
import { getChatMessageDisplayText } from './chatMessageContent'

const props = withDefaults(defineProps<{
  final?: boolean
  hiddenArtifacts?: readonly LocalArtifact[]
  language: BuddyLocale
  message: LocalMessage
}>(), {
  final: true,
  hiddenArtifacts: () => [],
})

const { t } = useBuddyI18n(() => props.language)
const attachmentTrack = useTemplateRef<HTMLDivElement>('attachmentTrack')
const failedAttachmentIds = shallowRef<ReadonlySet<string>>(new Set())
const previewIndex = shallowRef(0)
const previewOpen = shallowRef(false)
let previewTrackScrollLeft = 0
const text = computed(() => getChatMessageDisplayText(
  props.message,
  props.hiddenArtifacts,
))
const hasText = computed(() => text.value.trim().length > 0)
const attachmentViews = computed(() => props.message.attachments.map(attachment => ({
  attachment,
  previewUrl: resolveBuddyAttachmentPreviewUrl(attachment),
})))
const previewableAttachmentViews = computed(() => attachmentViews.value.filter(view => (
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
  >
    <BuddyImagePreview
      v-model:current="previewIndex"
      v-model:show="previewOpen"
      :language="language"
      :sources="previewSources"
      @update:show="updatePreviewOpen"
    />
    <div
      v-if="attachmentViews.length"
      ref="attachmentTrack"
      class="buddy-chat-message-content__attachments"
    >
      <figure
        v-for="view in attachmentViews"
        :key="view.attachment.attachmentId"
        class="buddy-chat-message-content__attachment"
      >
        <button
          v-if="view.previewUrl && !failedAttachmentIds.has(view.attachment.attachmentId)"
          class="buddy-chat-message-content__preview-trigger"
          type="button"
          :aria-label="t('desktop.imagePreview.open', { name: view.attachment.name })"
          @click="openPreview(view.attachment.attachmentId)"
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
          <BuddyFileIcon :name="view.attachment.name" size="preview" />
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
      v-if="hasText && message.role === 'user'"
      class="buddy-chat-message-content__text is-plain-text"
    >
      {{ text }}
    </div>
    <BuddyChatMarkdownContent
      v-else-if="hasText"
      class="buddy-chat-message-content__text"
      :content="text"
      :final="final"
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
  display: grid;
  width: min(10rem, 100%);
  flex: 0 0 10rem;
  gap: 0.2rem;
  margin: 0;

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
    background: var(--buddy-accent-surface);
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

@media (prefers-reduced-motion: reduce) {
  .buddy-chat-message-content__preview-trigger img {
    transition: none;
  }
}
</style>
