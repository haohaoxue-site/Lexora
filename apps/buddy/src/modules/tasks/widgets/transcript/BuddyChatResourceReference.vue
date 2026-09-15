<script setup lang="ts">
import type { LocalAttachment } from '@buddy-shared/conversation/attachmentApi'

import type { BuddyLocale } from '@/i18n/buddyI18n'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  attachment: Pick<LocalAttachment, 'name'>
  imageLabel?: string
  language: BuddyLocale
  resourceId: string
}>()

const emit = defineEmits<{
  locate: [resourceId: string]
}>()

const { t } = useBuddyI18n(() => props.language)
</script>

<template>
  <a
    class="buddy-chat-resource-reference"
    :href="`#buddy-resource-${resourceId}`"
    :aria-label="t('desktop.chat.locateAttachment', { name: imageLabel ?? attachment.name })"
    :data-resource-id="resourceId"
    @click.prevent="emit('locate', resourceId)"
  >{{ imageLabel ?? `@${attachment.name}` }}</a>
</template>

<style scoped lang="scss">
@use '@/shared/ui/highlight/waveHighlight' as highlight;

.buddy-chat-resource-reference {
  @include highlight.wave-highlight;

  display: inline;
  border: 0;
  border-radius: 0;
  color: var(--buddy-accent-on-surface);
  font-weight: 600;
  line-height: inherit;
  padding: 0 0.15em;
  vertical-align: baseline;
  white-space: nowrap;
  text-decoration: none;

  &:hover,
  &:focus-visible {
    --inline-wave-highlight-active: 1;
    outline: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .buddy-chat-resource-reference {
    transition: none;
  }
}
</style>
