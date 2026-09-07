<script setup lang="ts">
import type { ChatAgentReasoningNode } from './chatStreamingMessage'
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
  color: var(--buddy-chat-tool-body-color);
  font-size: 14px;
  line-height: 24px;
  overflow-wrap: anywhere;
  padding: 0.25rem 0;

  :deep(> :first-child) {
    margin-top: 0;
  }

  :deep(> :last-child) {
    margin-bottom: 0;
  }

  :deep(p) {
    margin: 0.35rem 0;
  }
}
</style>
