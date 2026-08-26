<script setup lang="ts">
import type { LocalMessage } from '@buddy-electron/shared/localChatApi'
import type { ImageGroupProps } from 'naive-ui'
import type { VNode } from 'vue'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { Document20Regular } from '@vicons/fluent'
import { NIcon, NImageGroup } from 'naive-ui'
import { computed, h, nextTick, shallowRef, useTemplateRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { resolveBuddyAttachmentPreviewUrl } from './chatAttachmentView'
import { getChatMessageText } from './chatMessageContent'

const props = defineProps<{
  html: string
  language: BuddyLocale
  message: LocalMessage
}>()

const { t } = useBuddyI18n(() => props.language)
const attachmentTrack = useTemplateRef<HTMLDivElement>('attachmentTrack')
const failedAttachmentIds = shallowRef<ReadonlySet<string>>(new Set())
const previewIndex = shallowRef(0)
const previewOpen = shallowRef(false)
let previewTrackScrollLeft = 0
const hasText = computed(() => getChatMessageText(props.message).trim().length > 0)
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
const renderPreviewToolbar: NonNullable<ImageGroupProps['renderToolbar']> = ({ nodes }) => h(
  'div',
  { class: 'buddy-chat-image-preview-toolbar' },
  [
    h('div', { class: 'buddy-chat-image-preview-toolbar__group' }, [
      previewToolbarButton(nodes.prev, t('desktop.chat.imagePreviewPrevious')),
      previewToolbarButton(nodes.next, t('desktop.chat.imagePreviewNext')),
    ]),
    h('span', { 'aria-hidden': 'true', 'class': 'buddy-chat-image-preview-toolbar__divider' }),
    h('div', { class: 'buddy-chat-image-preview-toolbar__group' }, [
      previewToolbarButton(nodes.zoomOut, t('desktop.chat.imagePreviewZoomOut')),
      previewToolbarButton(nodes.zoomIn, t('desktop.chat.imagePreviewZoomIn')),
    ]),
    h('span', { 'aria-hidden': 'true', 'class': 'buddy-chat-image-preview-toolbar__divider' }),
    h('div', { class: 'buddy-chat-image-preview-toolbar__group' }, [
      previewToolbarButton(nodes.download, t('desktop.chat.imagePreviewDownload')),
      previewToolbarButton(nodes.close, t('desktop.chat.imagePreviewClose'), true),
    ]),
  ],
)

function previewToolbarButton(node: VNode, label: string, close = false): VNode {
  return h('button', {
    'aria-label': label,
    'class': [
      'buddy-chat-image-preview-toolbar__button',
      { 'is-close': close },
    ],
    'type': 'button',
    'onClick': (event: MouseEvent) => invokeToolbarNode(node, event),
  }, [node])
}

function invokeToolbarNode(node: VNode, event: MouseEvent): void {
  const handler = node.props?.onClick as ((event: MouseEvent) => void) | ReadonlyArray<(
    event: MouseEvent,
  ) => void> | undefined
  if (typeof handler === 'function') {
    handler(event)
    return
  }
  for (const current of handler ?? [])
    current(event)
}

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
    <NImageGroup
      v-model:current="previewIndex"
      :show="previewOpen"
      :show-toolbar-tooltip="false"
      :render-toolbar="renderPreviewToolbar"
      :src-list="previewSources"
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
          :aria-label="t('desktop.chat.previewImage', { name: view.attachment.name })"
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
          <NIcon :component="Document20Regular" />
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
      v-if="hasText"
      class="buddy-chat-message-content__text"
      v-html="html"
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

  &:first-child {
    margin-inline-start: auto;
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

:global(.n-image-preview-container .n-image-preview) {
  max-width: min(72vw, 64rem) !important;
  max-height: min(72vh, 48rem) !important;
}

:global(.n-image-preview-container .n-image-preview-toolbar) {
  height: auto !important;
  bottom: 20px !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  padding: 0 !important;
}

:global(.buddy-chat-image-preview-toolbar) {
  display: flex;
  height: 34px;
  box-sizing: border-box;
  align-items: center;
  gap: 3px;
  border: 1px solid var(--buddy-media-overlay-border);
  border-radius: 10px;
  background: var(--buddy-media-overlay-background);
  box-shadow: var(--buddy-media-overlay-shadow);
  padding: 2px 3px;
  backdrop-filter: blur(12px);
}

:global(.buddy-chat-image-preview-toolbar__group) {
  display: flex;
  align-items: center;
  gap: 2px;
}

:global(.buddy-chat-image-preview-toolbar__divider) {
  width: 1px;
  height: 16px;
  flex: none;
  background: var(--buddy-media-overlay-divider);
}

:global(.buddy-chat-image-preview-toolbar__button) {
  display: grid;
  width: 28px;
  height: 28px;
  flex: none;
  place-items: center;
  border: 0;
  border-radius: var(--buddy-radius-micro);
  background: transparent;
  color: var(--buddy-media-overlay-text);
  cursor: pointer;
  padding: 0;
  transition:
    background-color 80ms ease,
    color 80ms ease;
}

:global(.buddy-chat-image-preview-toolbar__button:hover) {
  background: var(--buddy-media-overlay-hover);
  color: var(--buddy-text-on-accent);
}

:global(.buddy-chat-image-preview-toolbar__button:focus-visible) {
  outline: 2px solid var(--buddy-media-overlay-focus);
  outline-offset: 1px;
}

:global(.buddy-chat-image-preview-toolbar__button.is-close:hover) {
  background: var(--buddy-media-overlay-danger-hover);
}

:global(.buddy-chat-image-preview-toolbar__button .n-base-icon) {
  padding: 0 !important;
  font-size: 18px !important;
  pointer-events: none;
}
</style>
