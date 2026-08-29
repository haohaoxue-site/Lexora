<script setup lang="ts">
import type { ChatAgentTurn } from './chatStreamingMessage'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { useIntervalFn } from '@vueuse/core'
import { computed, shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import BuddyChatActivityLoader from './BuddyChatActivityLoader.vue'
import BuddyChatShimmerText from './BuddyChatShimmerText.vue'
import { formatChatRunDuration } from './chatRunDuration'

const props = defineProps<{
  language: BuddyLocale
  turn: ChatAgentTurn
}>()

const { t } = useBuddyI18n(() => props.language)
const now = shallowRef(Date.now())
useIntervalFn(() => {
  now.value = Date.now()
}, 1_000, {
  immediateCallback: true,
})

const duration = computed(() => formatChatRunDuration(
  props.turn.startedAt,
  props.turn.completedAt,
  now.value,
))

const activityLabel = computed(() => {
  switch (props.turn.progress?.phase) {
    case 'awaiting_approval':
      return t('desktop.chat.processAwaitingApproval')
    case 'preparing':
      return t('desktop.chat.progressPreparing')
    case 'model_requesting':
      return t('desktop.chat.progressModelRequesting')
    case 'model_streaming':
      return t('desktop.chat.progressModelStreaming')
    case 'tool_executing':
      return t('desktop.chat.progressToolExecuting')
    default:
      return t('desktop.chat.activity')
  }
})
</script>

<template>
  <div class="buddy-chat-run-activity">
    <BuddyChatActivityLoader />
    <BuddyChatShimmerText
      aria-live="polite"
      class="buddy-chat-run-activity__label"
      mode="continuous"
    >
      {{ activityLabel }}
    </BuddyChatShimmerText>
    <span class="buddy-chat-run-activity__duration">{{ duration }}</span>
  </div>
</template>

<style scoped lang="scss">
.buddy-chat-run-activity {
  display: flex;
  box-sizing: border-box;
  min-width: 0;
  min-height: calc(1.4em + var(--buddy-chat-gap-turn));
  align-items: center;
  gap: 0.4rem;
  color: var(--buddy-chat-meta-color);
  font-size: var(--buddy-chat-meta-font-size);
  line-height: var(--buddy-chat-meta-line-height);
  padding-bottom: var(--buddy-chat-gap-turn);
}

.buddy-chat-run-activity__label {
  --buddy-shimmer-base: var(--buddy-chat-meta-color);

  position: relative;
  min-width: 0;
  flex: 0 1 auto;
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-chat-run-activity__duration {
  min-width: 3.5ch;
  flex: 0 0 3.5ch;
  opacity: 0.78;
  font-variant-numeric: tabular-nums;
  text-align: left;
  white-space: nowrap;
}
</style>
