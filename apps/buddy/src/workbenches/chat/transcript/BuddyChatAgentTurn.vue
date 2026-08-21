<script setup lang="ts">
import type { ChatAgentTurn } from './chatStreamingMessage'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { ChevronRight20Regular } from '@vicons/fluent'
import { useIntervalFn } from '@vueuse/core'
import { NIcon } from 'naive-ui'
import { computed, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import BuddyChatAgentIdentity from './BuddyChatAgentIdentity.vue'
import BuddyChatReasoningGroup from './BuddyChatReasoningGroup.vue'
import BuddyChatToolRow from './BuddyChatToolRow.vue'
import {
  resolveChatAgentTurnFailurePresentation,
  resolveChatAgentTurnNotice,
} from './chatAgentTurnDisclosure'
import { projectChatAgentTurnRows } from './chatStreamingMessage'

const props = defineProps<{
  language: BuddyLocale
  open: boolean
  turn: ChatAgentTurn
}>()

const emit = defineEmits<{
  toggle: []
}>()

const { t } = useBuddyI18n(() => props.language)
const now = shallowRef(Date.now())
const durationClock = useIntervalFn(() => {
  now.value = Date.now()
}, 1_000, {
  immediate: false,
  immediateCallback: true,
})

watch(() => props.turn.status, (status) => {
  if (status === 'queued' || status === 'running')
    durationClock.resume()
  else
    durationClock.pause()
}, { immediate: true })

const duration = computed(() => {
  const start = Date.parse(props.turn.startedAt)
  const end = props.turn.completedAt ? Date.parse(props.turn.completedAt) : now.value
  return formatDuration(Math.max(0, end - start))
})
const status = computed(() => `${t(`run.status.${props.turn.status}`)} ${duration.value}`)
const rows = computed(() => projectChatAgentTurnRows(props.turn.nodes))
const notice = computed(() => resolveChatAgentTurnNotice(
  props.turn.status,
  props.turn.failureMessage ?? null,
))
const failurePresentation = computed(() => notice.value?.kind === 'failure'
  ? resolveChatAgentTurnFailurePresentation(
      props.turn.failureCode ?? null,
      notice.value.message,
    )
  : null)
const noticeText = computed(() => {
  if (!notice.value)
    return null
  if (notice.value.kind === 'activity')
    return t('desktop.chat.activity')
  if (notice.value.kind === 'cancelled')
    return t('desktop.chat.runCancelled')
  return failurePresentation.value?.message
    ?? t(failurePresentation.value?.messageKey ?? 'desktop.chat.runFailed')
})
const processNoticeText = computed(() => notice.value?.placement === 'process'
  ? noticeText.value
  : null)
const resultNoticeText = computed(() => notice.value?.placement === 'result'
  ? noticeText.value
  : null)
const failureDetailText = computed(() => failurePresentation.value?.detail ?? null)
const hasProcessContent = computed(() => (
  rows.value.length > 0
  || processNoticeText.value !== null
))
const hasVisibleProcess = computed(() => (
  props.open
  && (hasProcessContent.value || failureDetailText.value !== null)
))

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
  <section
    class="buddy-chat-agent-turn"
    :class="[`is-${turn.status}`, { 'has-visible-process': hasVisibleProcess }]"
  >
    <div class="buddy-chat-agent-turn__heading">
      <BuddyChatAgentIdentity :language="language" />
      <button
        :aria-expanded="open"
        class="buddy-chat-agent-turn__status"
        type="button"
        @click="emit('toggle')"
      >
        <span>{{ status }}</span>
        <NIcon
          :component="ChevronRight20Regular"
          class="buddy-chat-agent-turn__chevron"
          :class="{ 'is-open': open }"
        />
      </button>
    </div>
    <div
      v-show="hasVisibleProcess"
      class="buddy-chat-agent-turn__flow"
    >
      <template v-for="row in rows" :key="row.id">
        <BuddyChatReasoningGroup
          v-if="row.kind === 'reasoning-group'"
          :group="row"
          :language="language"
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
      <p
        v-if="processNoticeText && turn.nodes.length === 0"
        class="buddy-chat-agent-turn__notice"
      >
        {{ processNoticeText }}
      </p>
      <p v-if="failureDetailText" class="buddy-chat-agent-turn__failure-detail">
        <span>{{ t('desktop.chat.failureDetail') }}</span>
        {{ failureDetailText }}
      </p>
    </div>
    <p
      v-if="resultNoticeText"
      class="buddy-chat-agent-turn__result"
      :class="{ 'is-failure': notice?.kind === 'failure' }"
    >
      {{ resultNoticeText }}
    </p>
  </section>
</template>

<style scoped lang="scss">
.buddy-chat-agent-turn {
  display: grid;
  min-width: 0;
  align-items: start;
  color: var(--buddy-chat-process-color);
}

.buddy-chat-agent-turn__heading {
  display: grid;
  min-width: 0;
  gap: 0.375rem;
}

.buddy-chat-agent-turn__status {
  display: inline-flex;
  width: 100%;
  max-width: 100%;
  align-items: center;
  gap: 0.25rem;
  border: 0;
  background: transparent;
  color: var(--buddy-chat-meta-color);
  cursor: pointer;
  font: inherit;
  font-size: var(--buddy-chat-meta-font-size);
  line-height: var(--buddy-chat-meta-line-height);
  padding: 0;
  text-align: left;

  &:hover,
  &:focus-visible {
    color: var(--buddy-text-primary);
  }

}

.buddy-chat-agent-turn__chevron {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  margin-left: 0.35rem;
  opacity: 1;
  transition: transform 120ms ease;

  &.is-open {
    transform: rotate(90deg) translateX(0.5px);
  }
}

.buddy-chat-agent-turn.is-failed .buddy-chat-agent-turn__status {
  color: var(--buddy-chat-danger-color);
}

.buddy-chat-agent-turn__flow {
  display: grid;
  min-width: 0;
  gap: var(--buddy-chat-process-row-gap);
  margin-top: var(--buddy-chat-gap-block);
}

.buddy-chat-agent-turn__text,
.buddy-chat-agent-turn__notice,
.buddy-chat-agent-turn__result {
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

.buddy-chat-agent-turn__result {
  margin-top: var(--buddy-chat-gap-section);

  &.is-failure {
    color: var(--buddy-chat-danger-color);
  }
}

@media (prefers-reduced-motion: reduce) {
  .buddy-chat-agent-turn__chevron {
    transition: none;
  }
}
</style>
