<script setup lang="ts">
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{ language: BuddyLocale }>()
const { t } = useBuddyI18n(() => props.language)
</script>

<template>
  <span class="resource-reference-badge">{{ t('desktop.chat.resourceReference') }}</span>
</template>

<style scoped lang="scss">
.resource-reference-badge {
  flex: none;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 3px;
  background: var(--buddy-surface-raised);
  color: var(--buddy-text-secondary);
  font-size: 0.62rem;
  font-weight: 500;
  line-height: 1.4;
  padding: 0.05rem 0.28rem;
  white-space: nowrap;
}
</style>
