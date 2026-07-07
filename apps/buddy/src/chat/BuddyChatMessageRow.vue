<script setup lang="ts">
import type { BuddyChatTranscriptMessageRow } from '@/chat/chatTranscriptView'
import type { BuddyMessageAttachment } from '@/lib/tauriRuntime'
import { resolveBuddyAttachmentPreviewUrl } from '@/chat/chatAttachmentView'

defineProps<{
  row: BuddyChatTranscriptMessageRow
}>()

function formatAttachmentMeta(attachment: BuddyMessageAttachment) {
  return [
    formatAttachmentType(attachment),
    formatAttachmentSize(attachment.sizeBytes),
  ].filter(Boolean).join(' · ')
}

function formatAttachmentType(attachment: BuddyMessageAttachment) {
  if (attachment.mimeType) {
    const subtype = attachment.mimeType.split('/')[1]?.split(';')[0]
    if (subtype)
      return subtype.toUpperCase()
  }

  if (attachment.kind === 'text')
    return 'TEXT'

  if (attachment.kind === 'image')
    return 'IMAGE'

  return 'FILE'
}

function formatAttachmentSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0)
    return ''

  const units = ['B', 'KB', 'MB', 'GB']
  let value = sizeBytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return unitIndex === 0
    ? `${Math.round(value)} ${units[unitIndex]}`
    : `${value.toFixed(1)} ${units[unitIndex]}`
}
</script>

<template>
  <article
    class="buddy-chat-message-row"
    :class="[`is-${row.role}`, `is-${row.flow}`]"
  >
    <span
      v-if="row.role !== 'assistant'"
      class="buddy-chat-message-row__role"
    >
      {{ row.roleLabel }}
    </span>
    <div
      v-if="row.contentHtml"
      class="buddy-chat-message-row__content"
      v-html="row.contentHtml"
    />
    <ul
      v-if="row.attachments.length > 0"
      class="buddy-chat-message-row__attachments"
    >
      <li
        v-for="(attachment, index) in row.attachments"
        :key="`${attachment.attachmentId ?? ''}:${attachment.kind}:${attachment.name}:${attachment.sizeBytes}:${index}`"
        class="buddy-chat-message-row__attachment"
      >
        <span class="buddy-chat-message-row__attachment-preview">
          <img
            v-if="attachment.kind === 'image' && resolveBuddyAttachmentPreviewUrl(attachment)"
            :alt="attachment.name"
            :src="resolveBuddyAttachmentPreviewUrl(attachment)"
          >
          <span
            v-else
            class="buddy-chat-message-row__attachment-icon"
          >
            {{ formatAttachmentType(attachment) }}
          </span>
        </span>
        <span
          class="buddy-chat-message-row__attachment-name"
          :title="attachment.name"
        >
          {{ attachment.name }}
        </span>
        <span class="buddy-chat-message-row__attachment-meta">
          {{ formatAttachmentMeta(attachment) }}
        </span>
      </li>
    </ul>
  </article>
</template>

<style scoped lang="scss">
.buddy-chat-message-row {
  display: grid;
  gap: 7px;
  max-width: min(100%, 860px);
  min-width: 0;
}

.buddy-chat-message-row.is-user {
  justify-self: end;
  justify-items: end;
  width: min(100%, 860px);
}

.buddy-chat-message-row.is-user .buddy-chat-message-row__content {
  max-width: min(76%, 680px);
  border: 1px solid color-mix(in srgb, var(--buddy-accent-primary) 20%, var(--buddy-border-light));
  border-radius: 8px;
  background: color-mix(in srgb, var(--buddy-accent-primary) 9%, var(--buddy-bg-surface));
  color: var(--buddy-chat-user-color);
  font-size: var(--buddy-chat-user-font-size);
  line-height: var(--buddy-chat-user-line-height);
  padding: 10px 12px;
}

.buddy-chat-message-row.is-assistant,
.buddy-chat-message-row.is-system,
.buddy-chat-message-row.is-tool {
  justify-self: stretch;
  padding-right: min(8vw, 80px);
}

.buddy-chat-message-row__role {
  color: var(--buddy-chat-meta-color);
  font-size: var(--buddy-chat-caption-font-size);
  line-height: var(--buddy-chat-caption-line-height);
}

.buddy-chat-message-row__content {
  --buddy-chat-markdown-block-gap: 8px;
  --buddy-chat-markdown-code-gap: 12px;

  margin: 0;
  color: var(--buddy-chat-final-color);
  font-size: var(--buddy-chat-final-font-size);
  line-height: var(--buddy-chat-final-line-height);
  overflow-wrap: anywhere;
}

.buddy-chat-message-row.is-process .buddy-chat-message-row__content {
  color: var(--buddy-chat-process-color);
  font-size: var(--buddy-chat-process-font-size);
  line-height: var(--buddy-chat-process-line-height);
}

.buddy-chat-message-row.is-system .buddy-chat-message-row__content,
.buddy-chat-message-row.is-tool .buddy-chat-message-row__content {
  color: var(--buddy-chat-tool-body-color);
  font-size: var(--buddy-chat-tool-font-size);
  line-height: var(--buddy-chat-tool-body-line-height);
}

.buddy-chat-message-row__content :deep(:where(p, h1, h2, h3, ul, ol, blockquote, pre, table, figure)) {
  margin: 0;
}

.buddy-chat-message-row__content :deep(:where(p, h1, h2, h3, ul, ol, blockquote, pre, table, figure) + :where(p, h1, h2, h3, ul, ol, blockquote, pre, table, figure)) {
  margin-top: var(--buddy-chat-markdown-block-gap);
}

.buddy-chat-message-row__content :deep(:where(p, ul, ol, blockquote, pre, table, figure) + :where(h1, h2, h3, blockquote, pre, table, figure)),
.buddy-chat-message-row__content :deep(:where(h1, h2, h3, blockquote, pre, table, figure) + :where(p, ul, ol, blockquote, pre, table, figure)) {
  margin-top: var(--buddy-chat-markdown-code-gap);
}

.buddy-chat-message-row__content :deep(h1),
.buddy-chat-message-row__content :deep(h2),
.buddy-chat-message-row__content :deep(h3) {
  font-size: var(--buddy-chat-final-heading-font-size);
  font-weight: 600;
  line-height: var(--buddy-chat-final-heading-line-height);
}

.buddy-chat-message-row__content :deep(p) {
  white-space: pre-wrap;
}

.buddy-chat-message-row__content :deep(strong) {
  font-weight: 600;
}

.buddy-chat-message-row__content :deep(ul),
.buddy-chat-message-row__content :deep(ol) {
  display: grid;
  gap: 4px;
  padding-left: 18px;
}

.buddy-chat-message-row__content :deep(pre) {
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--buddy-border-light) 78%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--buddy-text-primary) 7%, var(--buddy-bg-surface));
  color: var(--buddy-chat-code-color);
  font-size: var(--buddy-chat-code-font-size);
  line-height: var(--buddy-chat-code-line-height);
  padding: 11px 12px;
  overscroll-behavior-x: contain;
}

.buddy-chat-message-row__content :deep(pre code) {
  display: block;
  min-width: max-content;
  white-space: pre;
}

.buddy-chat-message-row__content :deep(code) {
  font-family: var(--buddy-font-mono);
}

.buddy-chat-message-row__content :deep(:not(pre) > code) {
  border-radius: 5px;
  background: color-mix(in srgb, var(--buddy-text-primary) 7%, var(--buddy-bg-surface));
  font-size: 0.92em;
  padding: 1px 5px;
}

.buddy-chat-message-row__content :deep(figure) {
  display: grid;
  gap: 6px;
}

.buddy-chat-message-row__content :deep(img) {
  max-width: min(100%, 360px);
  max-height: 260px;
  border-radius: 8px;
  object-fit: contain;
}

.buddy-chat-message-row__content :deep(figcaption) {
  color: var(--buddy-chat-meta-color);
  font-size: var(--buddy-chat-caption-font-size);
  line-height: var(--buddy-chat-caption-line-height);
}

.buddy-chat-message-row__attachments {
  display: flex;
  width: max-content;
  max-width: 100%;
  gap: 10px;
  margin: 2px 0 0;
  overflow-x: auto;
  padding: 0 2px 6px;
  list-style: none;
}

.buddy-chat-message-row.is-user .buddy-chat-message-row__attachments {
  justify-self: end;
}

.buddy-chat-message-row__attachment {
  display: grid;
  flex: 0 0 168px;
  width: 168px;
  min-width: 0;
  gap: 7px;
  border: 1px solid color-mix(in srgb, var(--buddy-border-light) 86%, var(--buddy-accent-primary));
  border-radius: 8px;
  background: rgb(255 255 255 / 78%);
  box-shadow: 0 10px 24px rgb(36 54 45 / 8%);
  padding: 7px;
}

.buddy-chat-message-row__attachment-preview {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: 6px;
  background: color-mix(in srgb, var(--buddy-fill-light) 78%, var(--buddy-bg-surface));
}

.buddy-chat-message-row__attachment-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.buddy-chat-message-row__attachment-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 1px solid color-mix(in srgb, var(--buddy-accent-primary) 24%, var(--buddy-border-light));
  border-radius: 8px;
  background: color-mix(in srgb, var(--buddy-accent-primary) 10%, var(--buddy-bg-surface));
  color: var(--buddy-accent-primary);
  font-size: 11px;
  font-weight: 650;
  line-height: 1;
}

.buddy-chat-message-row__attachment-name {
  min-width: 0;
  overflow: hidden;
  color: var(--buddy-chat-final-color);
  font-size: var(--buddy-chat-tool-font-size);
  font-weight: 600;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-chat-message-row__attachment-meta {
  min-width: 0;
  overflow: hidden;
  color: var(--buddy-chat-meta-color);
  font-size: var(--buddy-chat-caption-font-size);
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 620px) {
  .buddy-chat-message-row.is-user .buddy-chat-message-row__content {
    max-width: 92%;
  }

  .buddy-chat-message-row.is-assistant,
  .buddy-chat-message-row.is-system,
  .buddy-chat-message-row.is-tool {
    padding-right: 0;
  }

}
</style>
