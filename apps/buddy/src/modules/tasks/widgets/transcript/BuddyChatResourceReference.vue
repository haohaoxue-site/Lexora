<script setup lang="ts">
import type { LocalAttachment } from '@buddy-shared/conversation/attachmentApi'

import type { BuddyLocale } from '@/i18n/buddyI18n'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { FileIcon } from '@/shared/ui/file-icon'

const props = defineProps<{
  attachment: LocalAttachment
  imageLabel?: string
  language: BuddyLocale
  resourceId: string
}>()

const emit = defineEmits<{
  locate: [resourceId: string]
}>()

const { t } = useBuddyI18n(() => props.language)
</script>

<template>
  <a
    v-if="imageLabel"
    class="buddy-chat-resource-reference is-image"
    :href="`#buddy-attachment-${attachment.attachmentId}`"
    :aria-label="t('desktop.chat.locateAttachment', { name: imageLabel })"
    :data-resource-id="resourceId"
    @click.prevent="emit('locate', resourceId)"
  >{{ imageLabel }}</a>
  <button
    v-else
    class="buddy-chat-resource-reference"
    type="button"
    :aria-label="t('desktop.chat.locateAttachment', { name: attachment.name })"
    :data-resource-id="resourceId"
    @click="emit('locate', resourceId)"
  >
    <FileIcon :name="attachment.name" size="small" />
    <span>{{ attachment.name }}</span>
  </button>
</template>

<style scoped lang="scss">
@use '@/shared/ui/highlight/waveHighlight' as highlight;

.buddy-chat-resource-reference {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 0.28rem;
  border: 1px solid color-mix(in srgb, var(--buddy-border-strong) 88%, var(--buddy-surface-raised));
  border-radius: 0.28rem;
  background: color-mix(in srgb, var(--buddy-surface-raised) 88%, transparent);
  color: inherit;
  font: inherit;
  line-height: 1.35;
  margin: 0 0.12rem;
  padding: 0.1rem 0.34rem;
  vertical-align: calc(-0.1rem - 1px);
  cursor: pointer;
  transition:
    background-color 100ms ease,
    border-color 100ms ease;

  > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &:hover {
    border-color: var(--buddy-accent-border);
    background: color-mix(in srgb, var(--buddy-accent-surface) 28%, var(--buddy-surface-raised));
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: 2px;
  }
}

.buddy-chat-resource-reference.is-image {
  @include highlight.wave-highlight;

  display: inline;
  border: 0;
  border-radius: 0;
  color: var(--buddy-accent-on-surface);
  font-weight: 600;
  line-height: inherit;
  padding: 0 0.15em;
  vertical-align: baseline;
  white-space: nowrap;
  text-decoration: none;

  &:hover,
  &:focus-visible {
    --inline-wave-highlight-active: 1;
    outline: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .buddy-chat-resource-reference,
  .buddy-chat-resource-reference.is-image {
    transition: none;
  }
}
</style>
