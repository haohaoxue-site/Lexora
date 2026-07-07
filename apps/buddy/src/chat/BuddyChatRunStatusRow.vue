<script setup lang="ts">
import type { BuddyChatTranscriptRunRow } from '@/chat/chatTranscriptView'
import { ChevronDown16Regular, ChevronRight16Regular } from '@vicons/fluent'
import { NIcon } from 'naive-ui'
import { computed } from 'vue'

const props = defineProps<{
  canToggleProcess: boolean
  isProcessCollapsed: boolean
  row: BuddyChatTranscriptRunRow
}>()

const emit = defineEmits<{
  toggleProcess: [runId: string]
}>()

const processToggleIcon = computed(() =>
  props.isProcessCollapsed ? ChevronRight16Regular : ChevronDown16Regular,
)

function toggleProcess() {
  emit('toggleProcess', props.row.runId)
}
</script>

<template>
  <div
    class="buddy-chat-run-status"
    :class="`is-${row.status}`"
  >
    <div class="buddy-chat-run-status__line">
      <span class="buddy-chat-run-status__label">
        <span>{{ row.label }}</span>
        <button
          v-if="canToggleProcess"
          class="buddy-chat-run-status__toggle"
          type="button"
          :aria-expanded="!isProcessCollapsed"
          @click="toggleProcess"
        >
          <NIcon :component="processToggleIcon" />
        </button>
      </span>
      <span
        v-if="row.summary"
        class="buddy-chat-run-status__summary"
      >
        {{ row.summary }}
      </span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.buddy-chat-run-status {
  display: grid;
  grid-template-columns: auto minmax(24px, 1fr);
  align-items: center;
  gap: 14px;
  max-width: min(100%, 860px);
  color: var(--buddy-chat-meta-color);
  font-size: var(--buddy-chat-meta-font-size);
  line-height: var(--buddy-chat-meta-line-height);
}

.buddy-chat-run-status::after {
  display: block;
  min-width: 0;
  border-top: 1px solid color-mix(in srgb, var(--buddy-border-light) 82%, transparent);
  content: "";
}

.buddy-chat-run-status__line {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.buddy-chat-run-status__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  min-width: 0;
}

.buddy-chat-run-status__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--buddy-chat-meta-color);
  cursor: pointer;
  padding: 0;
}

.buddy-chat-run-status__toggle:hover {
  background: color-mix(in srgb, var(--buddy-text-secondary) 10%, transparent);
  color: var(--buddy-text-primary);
}

.buddy-chat-run-status__toggle:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--buddy-accent-primary) 46%, transparent);
  outline-offset: 2px;
}

.buddy-chat-run-status__toggle :deep(.n-icon) {
  font-size: 16px;
  line-height: 1;
}

.buddy-chat-run-status__summary {
  min-width: 0;
  overflow: hidden;
  color: var(--buddy-chat-process-color);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-chat-run-status.is-failed {
  color: var(--buddy-chat-danger-color);
}
</style>
