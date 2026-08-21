<script setup lang="ts">
import type { LocalApproval } from '../../electron/shared/localChatApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  approval: LocalApproval
  language: BuddyLocale
  resolving: boolean
}>()
const emit = defineEmits<{ approve: [], deny: [] }>()
const { t } = useBuddyI18n(() => props.language)
const payload = computed(() => JSON.stringify(props.approval.payload, null, 2))
</script>

<template>
  <article class="desktop-approval-card">
    <div>
      <strong>{{ approval.summary }}</strong>
      <span>{{ t(`desktop.approval.kind.${approval.kind}`) }}</span>
    </div>
    <pre>{{ payload }}</pre>
    <footer>
      <button type="button" :disabled="resolving" @click="emit('deny')">
        {{ t('approvalAction.deny') }}
      </button>
      <button class="is-primary" type="button" :disabled="resolving" @click="emit('approve')">
        {{ resolving ? t('desktop.approval.processing') : t('approvalAction.approve') }}
      </button>
    </footer>
  </article>
</template>

<style scoped>
.desktop-approval-card {
  display: grid;
  gap: 0.65rem;
  border: 1px solid color-mix(in srgb, var(--buddy-accent-warning) 34%, var(--buddy-border-light));
  border-radius: 0.8rem;
  background: color-mix(in srgb, var(--buddy-accent-warning) 7%, var(--buddy-bg-surface-raised));
  padding: 0.75rem;
}

.desktop-approval-card > div {
  display: grid;
  gap: 0.15rem;
}

.desktop-approval-card span {
  color: var(--buddy-text-secondary);
  font-size: 0.72rem;
}

.desktop-approval-card pre {
  max-height: 9rem;
  margin: 0;
  overflow: auto;
  border-radius: 0.55rem;
  background: var(--buddy-bg-surface);
  font-family: var(--buddy-font-mono);
  font-size: 0.7rem;
  padding: 0.6rem;
  white-space: pre-wrap;
}

.desktop-approval-card footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.desktop-approval-card button {
  border: 1px solid var(--buddy-border-light);
  border-radius: 0.5rem;
  background: var(--buddy-bg-surface);
  color: var(--buddy-text-regular);
  cursor: pointer;
  padding: 0.4rem 0.7rem;
}

.desktop-approval-card button.is-primary {
  border-color: var(--buddy-accent-primary);
  background: var(--buddy-accent-primary);
  color: white;
}
</style>
