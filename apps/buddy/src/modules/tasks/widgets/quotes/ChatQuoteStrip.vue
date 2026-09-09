<script setup lang="ts">
import type { BuddyMessageQuote } from '@buddy-shared/conversation/buddyUserContent'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { Dismiss16Regular, TextQuote20Regular } from '@vicons/fluent'
import { NButton } from 'naive-ui'
import { inject } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import { chatQuoteNavigationKey } from './chatQuoteContext'

const props = defineProps<{
  quotes: readonly BuddyMessageQuote[]
  language: BuddyLocale
  removable?: boolean
  disabled?: boolean
  navigate?: (quote: BuddyMessageQuote) => void
}>()
const emit = defineEmits<{ remove: [id: string] }>()
const { t } = useBuddyI18n(() => props.language)
const locate = inject(chatQuoteNavigationKey, null)
</script>

<template>
  <div v-if="quotes.length" class="chat-quote-strip" data-quote-exclude>
    <div v-for="quote in quotes" :key="quote.id" class="chat-quote-card" :data-quote-id="quote.id">
      <button type="button" class="chat-quote-card__link" @click="(navigate ?? locate)?.(quote)">
        <DesktopIcon :component="TextQuote20Regular" class="chat-quote-card__icon" />
        <span class="chat-quote-card__body">
          <small>{{ t(quote.source.role === 'assistant' ? 'desktop.chat.quoteFromAssistant' : 'desktop.chat.quoteFromUser') }}</small>
          <span class="chat-quote-card__excerpt">{{ quote.text }}</span>
        </span>
      </button>
      <NButton
        v-if="removable" class="buddy-icon-button chat-quote-card__remove" quaternary size="tiny"
        :disabled="disabled" :aria-label="t('desktop.chat.removeQuote')" @click="emit('remove', quote.id)"
      >
        <template #icon>
          <DesktopIcon :component="Dismiss16Regular" />
        </template>
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.chat-quote-strip { display: flex; min-width: 0; max-width: 100%; gap: 8px; overflow-x: auto; overscroll-behavior-inline: contain; padding-bottom: 6px; }
.chat-quote-card { display: flex; flex: 0 0 auto; width: 180px; max-width: 100%; min-width: 0; align-items: flex-start; border: 1px solid var(--buddy-border-subtle); border-radius: var(--buddy-radius-micro); background: var(--buddy-surface-raised); }
.chat-quote-card__link { display: flex; flex: 1; gap: 8px; min-width: 0; padding: 8px 10px; border: 0; background: transparent; color: var(--buddy-text-primary); text-align: left; font: inherit; cursor: pointer; }
.chat-quote-card__link:hover { background: var(--buddy-state-hover); }
.chat-quote-card__link:focus-visible { outline: 2px solid var(--buddy-focus-ring); outline-offset: -2px; border-radius: var(--buddy-radius-micro); }
.chat-quote-card__icon { flex: none; margin-top: 2px; color: var(--buddy-accent-text); }
.chat-quote-card__body { display: grid; min-width: 0; gap: 3px; }
.chat-quote-card__body small { color: var(--buddy-text-secondary); font-size: 11px; }
.chat-quote-card__excerpt { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; line-height: 1.5; }
.chat-quote-card__remove { flex: none; margin: 4px 4px 0 0; }
</style>
