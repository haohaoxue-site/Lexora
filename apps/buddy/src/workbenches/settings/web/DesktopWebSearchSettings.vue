<script setup lang="ts">
import type { WebSearchProvider, WebSearchSource } from '@buddy-shared/webProtocol'
import type { DragEndEvent } from '@dnd-kit/vue'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { RestrictToVerticalAxis } from '@dnd-kit/abstract/modifiers'
import { DragDropProvider } from '@dnd-kit/vue'
import { isSortable } from '@dnd-kit/vue/sortable'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopWebSearchSource from './DesktopWebSearchSource.vue'

const props = defineProps<{ sources: readonly Readonly<WebSearchSource>[], disabled: boolean, language: BuddyLocale }>()
const emit = defineEmits<{
  toggle: [provider: WebSearchProvider, enabled: boolean]
  reorder: [provider: WebSearchProvider, target: WebSearchProvider, position: 'before' | 'after']
}>()
const { t } = useBuddyI18n(() => props.language)

function dragEnd(event: DragEndEvent) {
  if (event.canceled || props.disabled)
    return
  const { source } = event.operation
  if (!isSortable(source) || source.initialIndex === source.index)
    return
  const from = props.sources[source.initialIndex]
  const target = props.sources[source.index]
  if (from && target)
    emit('reorder', from.provider, target.provider, source.index < source.initialIndex ? 'before' : 'after')
}
</script>

<template>
  <section class="desktop-web-search">
    <header class="desktop-web-search__header">
      <h2 class="desktop-web-search__title">
        {{ t('desktop.web.search') }}
      </h2>
      <p class="desktop-web-search__description">
        {{ t('desktop.web.searchOrderDescription') }}
      </p>
      <span id="web-search-order-help" class="desktop-web-search__keyboard-help">{{ t('desktop.web.searchKeyboardHelp') }}</span>
    </header>
    <DragDropProvider :modifiers="[RestrictToVerticalAxis]" @drag-end="dragEnd">
      <ol class="desktop-web-search__list">
        <DesktopWebSearchSource v-for="(source, index) in sources" :key="source.provider" :source="source" :index="index" :disabled="disabled" :language="language" @toggle="emit('toggle', source.provider, $event)" />
      </ol>
    </DragDropProvider>
  </section>
</template>

<style scoped lang="scss">
.desktop-web-search { display: grid; gap: 0.8rem; }
.desktop-web-search__header { display: grid; gap: 0.3rem; }
.desktop-web-search__title { margin: 0; font-size: 0.92rem; font-weight: 600; }
.desktop-web-search__description { margin: 0; color: var(--buddy-text-secondary); font-size: 0.75rem; line-height: 1.65; }
.desktop-web-search__keyboard-help { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.desktop-web-search__list { margin: 0; padding: 0; list-style: none; border: 1px solid var(--buddy-border-subtle); border-radius: 0.65rem; }
</style>
