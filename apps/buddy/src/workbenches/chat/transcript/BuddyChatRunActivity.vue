<script setup lang="ts">
import type { ChatAgentTurn } from './chatStreamingMessage'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { useIntervalFn } from '@vueuse/core'
import { computed, shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  language: BuddyLocale
  turn: ChatAgentTurn
}>()

const { t } = useBuddyI18n(() => props.language)
const now = shallowRef(Date.now())

useIntervalFn(() => {
  now.value = Date.now()
}, 1_000, { immediateCallback: true })

const activityLabel = computed(() => {
  switch (props.turn.progress?.phase) {
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
const duration = computed(() => {
  const start = Date.parse(props.turn.startedAt)
  return formatDuration(Math.max(0, now.value - start))
})

function formatDuration(value: number): string {
  const seconds = Math.max(1, Math.round(value / 1_000))
  if (seconds < 60)
    return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`
}
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
    <span class="buddy-chat-run-activity__duration">{{ duration }}</span>
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

.buddy-chat-run-activity__label,
.buddy-chat-run-activity__duration {
  min-width: 0;
}

.buddy-chat-run-activity__duration {
  margin-left: 0.125rem;
  opacity: 0.78;
  font-variant-numeric: tabular-nums;
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
