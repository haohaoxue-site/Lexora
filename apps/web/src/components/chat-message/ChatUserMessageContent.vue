<script setup lang="ts">
import type { ChatMessage } from '@/apis/chat'
import { computed } from 'vue'
import {
  getAttachmentDisplayLabel,
  getPanelAttachments,
} from '@/components/chat-composer/attachmentOrdering'
import { serializeChatComposerContent } from '@/components/chat-composer/serialization'

const props = defineProps<{
  message: Extract<ChatMessage, { role: 'user' }>
}>()

const panelAttachments = computed(() => getPanelAttachments(props.message.metadata.attachments))
const bodyText = computed(() => serializeChatComposerContent(props.message.metadata.contentJSON).content || props.message.content)
</script>

<template>
  <div class="chat-user-message-content">
    <div v-if="panelAttachments.length" class="chat-user-message-content__contexts">
      <span
        v-for="attachment in panelAttachments"
        :key="attachment.id"
        class="chat-user-message-content__context"
        :title="getAttachmentDisplayLabel(attachment)"
      >
        {{ getAttachmentDisplayLabel(attachment) }}
      </span>
    </div>
    <div class="chat-user-message-content__body">
      {{ bodyText }}
    </div>
  </div>
</template>

<style scoped lang="scss">
.chat-user-message-content {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;

  .chat-user-message-content__contexts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.125rem;
  }

  .chat-user-message-content__context {
    max-width: 11rem;
    overflow: hidden;
    padding: 0.125rem 0.375rem;
    border: 1px solid color-mix(in srgb, #fff 24%, transparent);
    border-radius: 0.5rem;
    background: color-mix(in srgb, #fff 10%, transparent);
    color: color-mix(in srgb, #fff 84%, transparent);
    font-size: 0.75rem;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-user-message-content__body {
    line-height: 1.6;
    white-space: pre-wrap;
  }
}
</style>
