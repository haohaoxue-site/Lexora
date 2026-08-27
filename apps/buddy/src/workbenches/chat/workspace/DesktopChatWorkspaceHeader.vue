<script setup lang="ts">
import type { InputInst } from 'naive-ui'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import {
  ChevronDown20Regular,
  ChevronUp20Regular,
  Dismiss20Regular,
  PanelRight20Regular,
  Search20Regular,
} from '@vicons/fluent'
import { NIcon, NInput } from 'naive-ui'
import { computed, nextTick, useTemplateRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  activeSearchIndex: number
  artifactCount: number
  canOpenContext: boolean
  canSearchConversation: boolean
  conversationSearchLoading: boolean
  conversationSearchOpen: boolean
  conversationSearchQuery: string
  conversationSearchResultCount: number
  contextOpen: boolean
  language: BuddyLocale
  title: string
}>()
const emit = defineEmits<{
  closeConversationSearch: []
  nextConversationSearchResult: []
  openConversationSearch: []
  previousConversationSearchResult: []
  toggleContext: []
  updateConversationSearch: [query: string]
}>()

const searchInput = useTemplateRef<InputInst>('searchInput')
const { t } = useBuddyI18n(() => props.language)
const searchPosition = computed(() => {
  if (props.conversationSearchLoading)
    return t('desktop.chat.searchLoading')
  if (!props.conversationSearchResultCount)
    return '0 / 0'
  return `${props.activeSearchIndex + 1} / ${props.conversationSearchResultCount}`
})
const contextButtonLabel = computed(() => props.artifactCount
  ? t('desktop.context.openWithCount', { count: props.artifactCount })
  : t('desktop.context.open'))

watch(
  () => props.conversationSearchOpen,
  async (open) => {
    if (!open)
      return
    await nextTick()
    searchInput.value?.focus()
  },
)
</script>

<template>
  <header class="desktop-chat-workspace-header">
    <div class="desktop-chat-workspace-header__copy">
      <strong>{{ title }}</strong>
    </div>

    <div class="desktop-chat-workspace-header__actions">
      <div v-if="conversationSearchOpen" class="desktop-chat-workspace-header__search-control">
        <NInput
          ref="searchInput"
          clearable
          :input-props="{ 'aria-label': t('desktop.chat.searchOpen') }"
          size="small"
          :placeholder="t('desktop.chat.searchPlaceholder')"
          :value="conversationSearchQuery"
          @update:value="emit('updateConversationSearch', $event)"
        >
          <template #prefix>
            <NIcon :component="Search20Regular" />
          </template>
        </NInput>
        <span class="desktop-chat-workspace-header__search-position">{{ searchPosition }}</span>
        <button
          class="desktop-chat-workspace-header__icon-button"
          type="button"
          :aria-label="t('desktop.chat.searchPrevious')"
          :disabled="!conversationSearchResultCount"
          @click="emit('previousConversationSearchResult')"
        >
          <NIcon :component="ChevronUp20Regular" />
        </button>
        <button
          class="desktop-chat-workspace-header__icon-button"
          type="button"
          :aria-label="t('desktop.chat.searchNext')"
          :disabled="!conversationSearchResultCount"
          @click="emit('nextConversationSearchResult')"
        >
          <NIcon :component="ChevronDown20Regular" />
        </button>
        <button
          class="desktop-chat-workspace-header__icon-button"
          type="button"
          :aria-label="t('desktop.chat.searchClose')"
          @click="emit('closeConversationSearch')"
        >
          <NIcon :component="Dismiss20Regular" />
        </button>
      </div>

      <button
        v-else-if="canSearchConversation"
        class="desktop-chat-workspace-header__icon-button"
        type="button"
        :aria-label="t('desktop.chat.searchOpen')"
        @click="emit('openConversationSearch')"
      >
        <NIcon :component="Search20Regular" />
      </button>
      <button
        v-if="!contextOpen"
        class="desktop-chat-workspace-header__icon-button"
        data-testid="task-context-toggle"
        type="button"
        :aria-label="contextButtonLabel"
        :disabled="!canOpenContext"
        @click="emit('toggleContext')"
      >
        <NIcon :component="PanelRight20Regular" />
      </button>
    </div>
  </header>
</template>

<style scoped lang="scss">
.desktop-chat-workspace-header {
  display: flex;
  height: var(--buddy-region-header-height);
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
  border-bottom: 1px solid var(--buddy-border-subtle);
  background: var(--buddy-surface-base);
  padding: 0 0.9rem 0 1.1rem;
}

.desktop-chat-workspace-header__copy {
  display: grid;
  min-width: 5rem;
  gap: 0.05rem;

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-size: 0.88rem;
    font-weight: 660;
  }
}

.desktop-chat-workspace-header__actions,
.desktop-chat-workspace-header__search-control {
  display: flex;
  min-width: 0;
  flex: none;
  align-items: center;
  gap: 0.18rem;
}

.desktop-chat-workspace-header__search-control :deep(.n-input) {
  width: clamp(10rem, 18vw, 16rem);
}

.desktop-chat-workspace-header__search-position {
  min-width: 3.25rem;
  color: var(--buddy-text-secondary);
  font-size: 0.68rem;
  text-align: center;
  white-space: nowrap;
}

.desktop-chat-workspace-header__icon-button {
  display: grid;
  width: 2rem;
  height: 2rem;
  flex: none;
  place-items: center;
  border: 0;
  border-radius: var(--buddy-icon-button-radius);
  background: transparent;
  color: var(--buddy-text-primary);
  cursor: pointer;

  .n-icon {
    font-size: 18px;
  }

  &:hover:not(:disabled) {
    background: var(--buddy-state-hover);
    color: var(--buddy-text-strong);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: -2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.42;
  }
}
</style>
