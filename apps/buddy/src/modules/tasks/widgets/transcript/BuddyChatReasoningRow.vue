<script setup lang="ts">
import type { ChatAgentReasoningNode } from '../../model/transcript/chatStreamingMessage'
import { computed } from 'vue'
import { renderChatMarkdown } from './chatMarkdown'

const props = defineProps<{
  node: ChatAgentReasoningNode
}>()

const bodyHtml = computed(() => renderChatMarkdown(props.node.text))
</script>

<template>
  <div
    v-if="node.text"
    class="buddy-chat-reasoning-entry__body"
    v-html="bodyHtml"
  />
</template>

<style scoped lang="scss">
.buddy-chat-reasoning-entry__body {
  max-height: 12rem;
  margin: 0;
  overflow: auto;
  color: var(--buddy-text-secondary);
  font-size: var(--buddy-chat-tool-font-size);
  line-height: 1.7;
  overflow-wrap: anywhere;
  padding: 0.25rem 0;

  :deep(> :first-child) {
    margin-top: 0;
  }

  :deep(> :last-child) {
    margin-bottom: 0;
  }

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4),
  :deep(h5),
  :deep(h6) {
    font-size: inherit;
    font-weight: 500;
    margin: 0.5em 0;
  }

  :deep(strong) {
    font-weight: 500;
  }

  :deep(p) {
    margin: 0.35rem 0;
  }
}
</style>
