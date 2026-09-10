<script setup lang="ts">
import { computed } from 'vue'
import { presentChatToolRead } from '../../model/transcript/chatToolText'

const props = defineProps<{ output: string, lineStart: number, native: boolean }>()
const content = computed(() => presentChatToolRead(props.output, props.lineStart, props.native))
</script>

<template>
  <div class="buddy-chat-tool-read">
    <div class="buddy-chat-tool-read__viewport">
      <pre v-if="content.numbers" class="buddy-chat-tool-read__numbers" aria-hidden="true">{{ content.numbers }}</pre>
      <pre class="buddy-chat-tool-read__content"><code>{{ content.content }}</code></pre>
    </div>
    <p v-if="content.notice" class="buddy-chat-tool-read__notice">
      {{ content.notice }}
    </p>
  </div>
</template>

<style scoped>
.buddy-chat-tool-read__viewport {
  display: flex;
  max-height: 15rem;
  overflow: auto;
  padding: 4px 0 8px;
}

pre {
  margin: 0;
  font-family: var(--buddy-font-mono);
  font-size: var(--buddy-chat-code-font-size);
  line-height: var(--buddy-chat-code-line-height);
  tab-size: 2;
}

.buddy-chat-tool-read__numbers {
  position: sticky;
  left: 0;
  flex: none;
  min-width: 3ch;
  padding: 0 12px;
  background: var(--buddy-surface-subtle);
  color: var(--buddy-text-muted);
  text-align: right;
  user-select: none;
}

.buddy-chat-tool-read__content {
  flex: 1;
  padding: 0 12px 0 0;
  color: var(--buddy-chat-code-color);
}

.buddy-chat-tool-read__content:first-child { padding-left: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
.buddy-chat-tool-read__notice { margin: 0; padding: 5px 10px 8px; color: var(--buddy-text-muted); font-size: var(--buddy-chat-caption-font-size); overflow-wrap: anywhere; }
</style>
