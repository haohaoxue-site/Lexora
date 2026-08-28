<script setup lang="ts">
import type { StreamingAssistantMessage } from './chatStreamingMessage'
import BuddyChatMarkdownContent from './BuddyChatMarkdownContent.vue'

defineProps<{
  message: StreamingAssistantMessage
}>()
</script>

<template>
  <BuddyChatMarkdownContent
    :content="message.text"
    :final="false"
  />
</template>
