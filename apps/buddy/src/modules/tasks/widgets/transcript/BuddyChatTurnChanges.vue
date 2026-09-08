<script setup lang="ts">
import type { LocalChangeSetSummary } from '@buddy-shared/changes/changeApi'

import type { BuddyLocale } from '@/i18n/buddyI18n'
import { Code20Regular, Open16Regular } from '@vicons/fluent'
import { computed } from 'vue'

import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'

const props = defineProps<{
  changeSet: LocalChangeSetSummary
  language: BuddyLocale
}>()
const emit = defineEmits<{
  openChanges: [changeSetId: string]
}>()

const { t } = useBuddyI18n(() => props.language)
const summary = computed(() => t('desktop.chat.turnChanges', {
  count: props.changeSet.fileCount,
}))
</script>

<template>
  <button
    class="buddy-chat-turn-changes"
    data-testid="chat-turn-changes"
    type="button"
    @click="emit('openChanges', changeSet.changeSetId)"
  >
    <DesktopIcon :component="Code20Regular" />
    <span>{{ summary }}</span>
    <DesktopIcon class="buddy-chat-turn-changes__open" :component="Open16Regular" />
  </button>
</template>

<style scoped>
.buddy-chat-turn-changes {
  display: flex;
  width: fit-content;
  max-width: 100%;
  align-items: center;
  gap: 0.45rem;
  border: 0;
  border-radius: var(--buddy-radius-micro);
  background: transparent;
  color: var(--buddy-text-muted);
  cursor: pointer;
  font: inherit;
  padding: 0.25rem 0.125rem;
  text-align: left;
}

.buddy-chat-turn-changes:hover {
  background: var(--buddy-accent-surface-subtle);
  color: var(--buddy-accent-text);
}

.buddy-chat-turn-changes:focus-visible {
  outline: 2px solid var(--buddy-focus-ring);
  outline-offset: 2px;
}

.buddy-chat-turn-changes > :deep(.n-icon) {
  width: 1rem;
  height: 1rem;
  flex: none;
  font-size: 1rem;
}

.buddy-chat-turn-changes span {
  overflow: hidden;
  font-size: var(--buddy-chat-caption-font-size);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-chat-turn-changes__open {
  color: var(--buddy-text-muted);
}
</style>
