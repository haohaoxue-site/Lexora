<script setup lang="ts">
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { presentChatToolDiff } from '../../model/transcript/chatToolDiff'
import BuddyChatToolToolbar from './BuddyChatToolToolbar.vue'

const props = defineProps<{ diff: string, language: BuddyLocale, filePath?: string }>()
const { t } = useBuddyI18n(() => props.language)
const presentation = computed(() => presentChatToolDiff(props.diff))
</script>

<template>
  <section class="buddy-chat-tool-diff">
    <BuddyChatToolToolbar :language="language" :title="filePath || t('desktop.chat.processToolChanges')" :file-path="filePath" :copy-text="diff">
      <span class="buddy-chat-tool-diff__counts">
        <span class="is-added" :aria-label="t('desktop.chat.processToolAddedLines', { count: presentation.added })">+{{ presentation.added }}</span>
        <span class="is-deleted" :aria-label="t('desktop.chat.processToolDeletedLines', { count: presentation.deleted })">−{{ presentation.deleted }}</span>
      </span>
    </BuddyChatToolToolbar>
    <pre><code><span v-for="(block, index) in presentation.blocks" :key="index" class="buddy-chat-tool-diff__block" :class="`is-${block.kind}`">{{ block.text }}{{ index < presentation.blocks.length - 1 ? '\n' : '' }}</span></code></pre>
  </section>
</template>

<style scoped>
.buddy-chat-tool-diff {
  min-width: 0;
  overflow: hidden;
  border-radius: var(--buddy-radius-micro);
  background: var(--buddy-surface-subtle);
}

.buddy-chat-tool-diff__counts { display: flex; flex: none; gap: 8px; font-variant-numeric: tabular-nums; }
.is-added { color: var(--buddy-status-success-text); }
.is-deleted { color: var(--buddy-status-danger-text); }
.is-meta { color: var(--buddy-text-muted); }

pre {
  max-height: 15rem;
  margin: 0;
  padding: 4px 0 8px;
  overflow: auto;
  color: var(--buddy-chat-code-color);
  font-family: var(--buddy-font-mono);
  font-size: var(--buddy-chat-code-font-size);
  line-height: var(--buddy-chat-code-line-height);
  tab-size: 2;
}

code { display: block; min-width: max-content; }
.buddy-chat-tool-diff__block { display: block; min-height: 1lh; padding: 0 10px; white-space: pre; }
.buddy-chat-tool-diff__block.is-added { background: var(--buddy-status-success-surface); }
.buddy-chat-tool-diff__block.is-deleted { background: var(--buddy-status-danger-surface); }
</style>
