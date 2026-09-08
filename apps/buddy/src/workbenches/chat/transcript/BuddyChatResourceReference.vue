<script setup lang="ts">
import type { LocalAttachment } from '@buddy-electron/shared/localChatApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { NPopover } from 'naive-ui'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import BuddyFileIcon from '@/ui/files/BuddyFileIcon.vue'

const props = defineProps<{
  attachment: LocalAttachment
  language: BuddyLocale
  previewUrl: string | null
  resourceId: string
}>()

const emit = defineEmits<{
  preview: [attachmentId: string]
  previewError: [attachmentId: string]
}>()

const { t } = useBuddyI18n(() => props.language)
const canPreview = computed(() => props.previewUrl !== null)
</script>

<template>
  <NPopover
    v-if="canPreview"
    placement="top-start"
    :show-arrow="false"
    trigger="hover"
  >
    <template #trigger>
      <button
        class="buddy-chat-resource-reference is-previewable"
        type="button"
        :aria-label="t('desktop.imagePreview.open', { name: attachment.name })"
        :data-resource-id="resourceId"
        @click="emit('preview', attachment.attachmentId)"
      >
        <BuddyFileIcon :name="attachment.name" size="small" />
        <span>{{ attachment.name }}</span>
      </button>
    </template>
    <figure class="buddy-chat-resource-reference__preview">
      <img
        :src="previewUrl!"
        alt=""
        height="132"
        width="196"
        @error="emit('previewError', attachment.attachmentId)"
      >
      <figcaption>{{ attachment.name }}</figcaption>
    </figure>
  </NPopover>
  <span
    v-else
    class="buddy-chat-resource-reference"
    :data-resource-id="resourceId"
  >
    <BuddyFileIcon :name="attachment.name" size="small" />
    <span>{{ attachment.name }}</span>
  </span>
</template>

<style scoped lang="scss">
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

  > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &.is-previewable {
    cursor: zoom-in;
    transition:
      background-color 100ms ease,
      border-color 100ms ease;

    &:hover {
      border-color: var(--buddy-accent-border);
      background: color-mix(in srgb, var(--buddy-accent-surface) 28%, var(--buddy-surface-raised));
    }

    &:focus-visible {
      outline: 2px solid var(--buddy-focus-ring);
      outline-offset: 2px;
    }
  }
}

.buddy-chat-resource-reference__preview {
  display: grid;
  width: min(12.25rem, calc(100vw - 2rem));
  gap: 0;
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 0.42rem;
  background: var(--buddy-surface-raised);
  box-shadow: var(--buddy-shadow-raised);

  img {
    display: block;
    width: 100%;
    height: 8.25rem;
    background: var(--buddy-surface-base);
    object-fit: contain;
  }

  figcaption {
    overflow: hidden;
    color: var(--buddy-text-secondary);
    font-size: 0.68rem;
    line-height: 1.3;
    padding: 0.36rem 0.45rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  .buddy-chat-resource-reference.is-previewable {
    transition: none;
  }
}
</style>
