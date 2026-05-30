<script setup lang="ts">
import type { ReadableDocumentSearchResult } from '@/apis/document'
import { Search } from '@element-plus/icons-vue'
import { nextTick, useTemplateRef, watch } from 'vue'
import { useChatDocumentSearch } from './useChatDocumentSearch'

const props = defineProps<{
  visible: boolean
}>()

const emits = defineEmits<{
  close: []
  select: [document: ReadableDocumentSearchResult]
}>()

const searchInputRef = useTemplateRef<HTMLInputElement>('searchInput')
const {
  query,
  documents,
  isLoading,
  errorMessage,
  isEmpty,
  setQuery,
  reset,
} = useChatDocumentSearch()

watch(() => props.visible, async (visible) => {
  if (!visible) {
    reset()
    return
  }

  await nextTick()
  searchInputRef.value?.focus()
})

function handleSelect(document: ReadableDocumentSearchResult) {
  emits('select', document)
  reset()
}

function handleInput(event: Event) {
  setQuery(event.target instanceof HTMLInputElement ? event.target.value : '')
}
</script>

<template>
  <div v-if="props.visible" class="chat-document-picker" @mousedown.stop>
    <div class="chat-document-picker__search">
      <ElIcon class="chat-document-picker__search-icon">
        <Search />
      </ElIcon>
      <input
        ref="searchInput"
        class="chat-document-picker__input"
        :value="query"
        placeholder="搜索文档"
        @input="handleInput"
        @keydown.esc="emits('close')"
      >
    </div>

    <div class="chat-document-picker__body">
      <div v-if="isLoading" class="chat-document-picker__state">
        搜索中...
      </div>
      <div v-else-if="errorMessage" class="chat-document-picker__state is-error">
        {{ errorMessage }}
      </div>
      <div v-else-if="isEmpty" class="chat-document-picker__state">
        没有匹配文档
      </div>
      <template v-else>
        <button
          v-for="document in documents"
          :key="document.id"
          class="chat-document-picker__item"
          type="button"
          @click="handleSelect(document)"
        >
          <SvgIcon category="ui" icon="document-tree-file" size="1rem" class="chat-document-picker__item-icon" />
          <span class="chat-document-picker__item-title">{{ document.title }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chat-document-picker {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 12;
  width: min(24rem, calc(100% - 2rem));
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--brand-border-base) 78%, transparent);
  border-radius: 0.75rem;
  background: var(--brand-bg-surface-raised);
  box-shadow: var(--brand-shadow-floating);
  pointer-events: auto;
  transform: translate(-50%, -50%);

  .chat-document-picker__search {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    border-bottom: 1px solid color-mix(in srgb, var(--brand-border-base) 66%, transparent);
  }

  .chat-document-picker__search-icon {
    color: var(--brand-text-secondary);
  }

  .chat-document-picker__input {
    min-width: 0;
    width: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--brand-text-primary);
    font-size: 0.875rem;
  }

  .chat-document-picker__input::placeholder {
    color: var(--brand-text-placeholder);
  }

  .chat-document-picker__body {
    max-height: 16rem;
    overflow-y: auto;
    padding: 0.375rem;
  }

  .chat-document-picker__state {
    padding: 1rem 0.75rem;
    color: var(--brand-text-secondary);
    font-size: 0.8125rem;
    text-align: center;
  }

  .chat-document-picker__state.is-error {
    color: var(--el-color-danger);
  }

  .chat-document-picker__item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    min-width: 0;
    padding: 0.5rem 0.625rem;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    color: var(--brand-text-primary);
    cursor: pointer;
    font-size: 0.875rem;
    text-align: left;

    &:hover {
      background: color-mix(in srgb, var(--brand-fill-light) 72%, transparent);
    }
  }

  .chat-document-picker__item-icon {
    flex: none;
    color: var(--brand-text-secondary);
  }

  .chat-document-picker__item-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
