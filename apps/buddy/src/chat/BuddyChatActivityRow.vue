<script setup lang="ts">
import type { BuddyChatTranscriptActivityRow } from '@/chat/chatTranscriptView'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { ChevronDown16Regular, ChevronRight16Regular } from '@vicons/fluent'
import { NIcon } from 'naive-ui'
import { computed, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  language: BuddyLocale
  row: BuddyChatTranscriptActivityRow
}>()

const { t } = useBuddyI18n(() => props.language)
const isActivityOpen = shallowRef(props.row.status !== 'completed')
const isOutputOpen = shallowRef(false)

const activityToggleIcon = computed(() =>
  isActivityOpen.value ? ChevronDown16Regular : ChevronRight16Regular,
)

const activityTitle = computed(() => {
  if (props.row.status !== 'completed')
    return `${props.row.label}·${resolveActivityStatusLabel(props.row.status)}`

  if (props.row.kind === 'tool')
    return `${props.row.label}·${props.row.itemCount ?? 1}条`

  return props.row.label
})

const outputToggleIcon = computed(() =>
  isOutputOpen.value ? ChevronDown16Regular : ChevronRight16Regular,
)

watch(() => props.row.status, (status) => {
  isActivityOpen.value = status !== 'completed'
})

watch(() => props.row.id, () => {
  isActivityOpen.value = props.row.status !== 'completed'
  isOutputOpen.value = false
})

function resolveActivityStatusLabel(status: 'running' | 'completed' | 'failed') {
  if (status === 'completed')
    return t('activity.status.completed')

  if (status === 'failed')
    return t('activity.status.failed')

  return t('activity.status.running')
}

function handleActivityToggle(event: Event) {
  const target = event.currentTarget
  isActivityOpen.value = target instanceof HTMLDetailsElement && target.open
}

function handleOutputToggle(event: Event) {
  const target = event.currentTarget
  isOutputOpen.value = target instanceof HTMLDetailsElement && target.open
}
</script>

<template>
  <article
    class="buddy-chat-activity"
    :class="[
      `is-${row.kind}`,
      `is-${row.status}`,
      { 'is-output-collapsed': row.output && isActivityOpen && !isOutputOpen },
    ]"
  >
    <details
      class="buddy-chat-activity__details"
      :open="isActivityOpen"
      @toggle="handleActivityToggle"
    >
      <summary class="buddy-chat-activity__summary">
        <span class="buddy-chat-activity__title">{{ activityTitle }}</span>
        <NIcon
          aria-hidden="true"
          class="buddy-chat-activity__toggle"
          :component="activityToggleIcon"
        />
      </summary>

      <div class="buddy-chat-activity__content">
        <p>{{ row.summary }}</p>

        <details
          v-if="row.output"
          class="buddy-chat-activity__output"
          @toggle="handleOutputToggle"
        >
          <summary class="buddy-chat-activity__output-summary">
            <span class="buddy-chat-activity__output-title">{{ t('tool.output') }}</span>
            <NIcon
              aria-hidden="true"
              class="buddy-chat-activity__toggle buddy-chat-activity__output-toggle"
              :component="outputToggleIcon"
            />
          </summary>
          <template v-if="isOutputOpen">
            <pre><code>{{ row.output }}</code></pre>
          </template>
        </details>
      </div>
    </details>
  </article>
</template>

<style scoped lang="scss">
.buddy-chat-activity {
  max-width: min(100%, 860px);
  color: var(--buddy-chat-tool-title-color);
}

.buddy-chat-activity.is-output-collapsed {
  margin-bottom: -10px;
}

.buddy-chat-activity__details {
  min-width: 0;
}

.buddy-chat-activity__summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  max-width: 100%;
  color: var(--buddy-chat-tool-title-color);
  cursor: pointer;
  font-size: var(--buddy-chat-tool-font-size);
  line-height: var(--buddy-chat-tool-line-height);
  list-style: none;
  user-select: none;
}

.buddy-chat-activity__summary::-webkit-details-marker {
  display: none;
}

.buddy-chat-activity__summary::marker {
  content: "";
}

.buddy-chat-activity__title {
  min-width: 0;
  color: var(--buddy-chat-tool-title-color);
}

.buddy-chat-activity__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  color: var(--buddy-chat-meta-color);
  font-size: 16px;
  line-height: 1;
  opacity: 0;
  transition: opacity 120ms ease;
}

.buddy-chat-activity__summary:hover .buddy-chat-activity__toggle,
.buddy-chat-activity__summary:focus-visible .buddy-chat-activity__toggle {
  opacity: 1;
}

.buddy-chat-activity__output-toggle {
  opacity: 1;
}

.buddy-chat-activity__content {
  display: grid;
  gap: 6px;
  margin-top: 6px;
  min-width: 0;
}

.buddy-chat-activity__content p {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--buddy-chat-tool-body-color);
  font-size: var(--buddy-chat-tool-font-size);
  line-height: var(--buddy-chat-tool-body-line-height);
  white-space: pre-wrap;
}

.buddy-chat-activity__output {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.buddy-chat-activity__output-summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  max-width: 100%;
  color: var(--buddy-chat-tool-title-color);
  cursor: pointer;
  font-size: var(--buddy-chat-tool-font-size);
  line-height: var(--buddy-chat-tool-line-height);
  list-style: none;
  user-select: none;
}

.buddy-chat-activity__output-summary::-webkit-details-marker {
  display: none;
}

.buddy-chat-activity__output-summary::marker {
  content: "";
}

.buddy-chat-activity__output-title {
  min-width: 0;
}

.buddy-chat-activity__output pre {
  margin: 0;
  overflow: auto;
  border-radius: 8px;
  background: color-mix(in srgb, var(--buddy-text-primary) 4%, transparent);
  color: var(--buddy-chat-code-color);
  font-size: var(--buddy-chat-code-font-size);
  line-height: var(--buddy-chat-code-line-height);
  max-height: 220px;
  padding: 8px 10px;
  white-space: pre-wrap;
}

.buddy-chat-activity__output code {
  overflow-wrap: anywhere;
}
</style>
