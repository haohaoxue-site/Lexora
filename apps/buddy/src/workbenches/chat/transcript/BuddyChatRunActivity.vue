<script setup lang="ts">
import type { ChatAgentTurn } from './chatStreamingMessage'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  language: BuddyLocale
  turn: ChatAgentTurn
}>()

const { t } = useBuddyI18n(() => props.language)

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
    <span
      aria-live="polite"
      class="buddy-chat-run-activity__label"
    >{{ activityLabel }}</span>
    <span
      aria-hidden="true"
      class="buddy-chat-run-activity__dots"
    >
      <i class="buddy-chat-run-activity__dot">.</i>
      <i class="buddy-chat-run-activity__dot">.</i>
      <i class="buddy-chat-run-activity__dot">.</i>
    </span>
  </div>
</template>

<style scoped lang="scss">
.buddy-chat-run-activity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.25rem;
  color: var(--buddy-chat-meta-color);
  font-size: var(--buddy-chat-meta-font-size);
  line-height: var(--buddy-chat-meta-line-height);
  padding-bottom: var(--buddy-chat-gap-turn);
}

.buddy-chat-run-activity__label {
  min-width: 0;
}

.buddy-chat-run-activity__dots {
  display: inline-flex;
  margin-left: 0.125rem;
}

.buddy-chat-run-activity__dot {
  animation: buddy-chat-run-activity-dot 1.2s infinite both;
  font-style: normal;

  &:nth-child(2) {
    animation-delay: 120ms;
  }

  &:nth-child(3) {
    animation-delay: 240ms;
  }
}

@keyframes buddy-chat-run-activity-dot {
  0%,
  80%,
  100% {
    opacity: 0.28;
  }

  40% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .buddy-chat-run-activity__dot {
    animation: none;
  }
}
</style>
