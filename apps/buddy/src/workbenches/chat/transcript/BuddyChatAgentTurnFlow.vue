<script setup lang="ts">
import type { ChatAgentTurnNode } from './chatStreamingMessage'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import BuddyChatCompactionRow from './BuddyChatCompactionRow.vue'
import BuddyChatReasoningGroup from './BuddyChatReasoningGroup.vue'
import BuddyChatToolRow from './BuddyChatToolRow.vue'
import { createChatAgentTurnRowProjector } from './chatStreamingMessage'

const props = defineProps<{
  failureDetailText: string | null
  language: BuddyLocale
  nodes: ReadonlyArray<ChatAgentTurnNode>
}>()

const { t } = useBuddyI18n(() => props.language)
const rowProjector = createChatAgentTurnRowProjector()
const rows = computed(() => rowProjector.project(props.nodes))
</script>

<template>
  <div class="buddy-chat-agent-turn__flow">
    <template v-for="row in rows" :key="row.id">
      <BuddyChatReasoningGroup
        v-if="row.kind === 'reasoning-group'"
        :group="row"
        :language="language"
      />
      <BuddyChatCompactionRow
        v-else-if="row.kind === 'compaction'"
        :language="language"
        :node="row"
      />
      <BuddyChatToolRow
        v-else-if="row.kind === 'tool'"
        :language="language"
        :node="row"
      />
      <p v-else class="buddy-chat-agent-turn__text">
        {{ row.text }}
      </p>
    </template>
    <p v-if="failureDetailText" class="buddy-chat-agent-turn__failure-detail">
      <span>{{ t('desktop.chat.failureDetail') }}</span>
      {{ failureDetailText }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.buddy-chat-agent-turn__flow {
  display: grid;
  min-width: 0;
  gap: var(--buddy-chat-process-row-gap);
  margin-top: var(--buddy-chat-gap-block);
}

.buddy-chat-agent-turn__text {
  margin: 0;
  color: var(--buddy-chat-tool-body-color);
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.buddy-chat-agent-turn__failure-detail {
  margin: 0;
  color: var(--buddy-chat-meta-color);
  font-size: var(--buddy-chat-meta-font-size);
  line-height: var(--buddy-chat-meta-line-height);
  overflow-wrap: anywhere;
  white-space: pre-wrap;

  span {
    color: var(--buddy-chat-process-color);
    font-weight: 600;
  }
}
</style>
