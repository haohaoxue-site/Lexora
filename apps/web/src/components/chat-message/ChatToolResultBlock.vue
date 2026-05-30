<script setup lang="ts">
import type { ChatMessage } from '@/apis/chat'
import { computed } from 'vue'
import ChatMarkdownContent from '@/components/chat-markdown/ChatMarkdownContent.vue'

const props = defineProps<{
  messageId: string
  status: string
  part: ChatMessage['parts'][number]
  index: number
}>()

const toolName = computed(() => props.part.metadata?.toolName ?? '返回结果')
const summary = computed(() => getToolResultSummary(props.part.text))

function getToolResultSummary(text: string): string {
  const firstLine = text.split('\n').find(line => line.trim())?.trim() ?? '暂无内容'
  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}...` : firstLine
}
</script>

<template>
  <details class="chat-tool-result-block">
    <summary class="chat-tool-result-block__summary">
      <span class="chat-tool-result-block__index">返回结果 {{ props.index + 1 }}</span>
      <span class="chat-tool-result-block__name">{{ toolName }}</span>
      <span class="chat-tool-result-block__text">{{ summary }}</span>
    </summary>
    <div class="chat-tool-result-block__body">
      <ChatMarkdownContent
        :message-id="props.messageId"
        :part-id="props.part.id"
        :source="props.part.text"
        :status="props.status"
        :is-streaming="false"
      />
    </div>
  </details>
</template>

<style scoped lang="scss">
.chat-tool-result-block {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--brand-border-base) 62%, transparent);
  border-radius: 0.625rem;
  background: color-mix(in srgb, var(--brand-fill-light) 54%, transparent);

  .chat-tool-result-block__summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    padding: 0.5rem 0.625rem;
    color: var(--brand-text-secondary);
    cursor: pointer;
    font-size: 0.8125rem;
    line-height: 1.5;
  }

  .chat-tool-result-block__index,
  .chat-tool-result-block__name {
    flex-shrink: 0;
    font-weight: 600;
  }

  .chat-tool-result-block__name {
    color: var(--brand-text-primary);
  }

  .chat-tool-result-block__text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-tool-result-block__body {
    padding: 0 0.625rem 0.625rem;
  }
}
</style>
