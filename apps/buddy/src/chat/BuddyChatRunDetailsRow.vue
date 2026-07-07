<script setup lang="ts">
import type {
  BuddyChatTranscriptRunDetail,
  BuddyChatTranscriptRunDetailsRow,
} from '@/chat/chatTranscriptView'
import { ChevronDown16Regular, ChevronRight16Regular } from '@vicons/fluent'
import { NIcon } from 'naive-ui'
import { computed, shallowRef } from 'vue'

const props = defineProps<{
  row: BuddyChatTranscriptRunDetailsRow
}>()

const detailsOpen = shallowRef(props.row.defaultOpen)
const detailsToggleIcon = computed(() =>
  detailsOpen.value ? ChevronDown16Regular : ChevronRight16Regular,
)

function handleDetailsToggle(event: Event) {
  const target = event.currentTarget
  detailsOpen.value = target instanceof HTMLDetailsElement && target.open
}

function resolveDetailText(detail: BuddyChatTranscriptRunDetail) {
  const summary = detail.summary.trim()
  const label = detail.label.trim()
  if (!summary)
    return label

  if (!label || summary === label)
    return summary

  return `${label} ${summary}`
}
</script>

<template>
  <details
    class="buddy-chat-run-details"
    :open="row.defaultOpen"
    @toggle="handleDetailsToggle"
  >
    <summary>
      <span>{{ row.summaryLabel }}</span>
      <NIcon
        aria-hidden="true"
        class="buddy-chat-run-details__toggle"
        :component="detailsToggleIcon"
      />
    </summary>

    <ul>
      <li
        v-for="detail in row.details"
        :key="`${detail.kind}-${detail.label}-${detail.summary}`"
        :class="[`is-${detail.kind}`, `is-${detail.status}`]"
      >
        {{ resolveDetailText(detail) }}
      </li>
    </ul>
  </details>
</template>

<style scoped lang="scss">
.buddy-chat-run-details {
  display: grid;
  gap: 10px;
  max-width: min(100%, 860px);
  color: var(--buddy-chat-tool-title-color);
}

.buddy-chat-run-details summary {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  width: fit-content;
  max-width: 100%;
  cursor: pointer;
  font-size: var(--buddy-chat-tool-font-size);
  line-height: var(--buddy-chat-tool-line-height);
  list-style: none;
  user-select: none;
}

.buddy-chat-run-details summary span {
  min-width: 0;
}

.buddy-chat-run-details summary::-webkit-details-marker {
  display: none;
}

.buddy-chat-run-details summary::marker {
  content: "";
}

.buddy-chat-run-details__toggle {
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

.buddy-chat-run-details summary:hover .buddy-chat-run-details__toggle,
.buddy-chat-run-details summary:focus-visible .buddy-chat-run-details__toggle {
  opacity: 1;
}

.buddy-chat-run-details ul {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.buddy-chat-run-details li {
  position: relative;
  color: var(--buddy-chat-tool-body-color);
  font-size: var(--buddy-chat-tool-font-size);
  line-height: var(--buddy-chat-tool-body-line-height);
  overflow-wrap: anywhere;
}

.buddy-chat-run-details li.is-running {
  color: var(--buddy-chat-process-color);
}
</style>
