<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import type { TiptapEditorContent } from '../../core/typing'
import { useEditorOutline } from './useEditorOutline'

const props = defineProps<{
  editor: Editor
  content: TiptapEditorContent
}>()
const {
  getBlockHref,
  getSearchResultText,
  getHeadingText,
  handleSearchKeydown,
  isActiveOutlineBlock,
  isExpanded,
  isSearchResultSelected,
  outline,
  resolveOutlineIndicatorWidth,
  resolveOutlineIndent,
  searchQuery,
  searchResults,
  selectBlock,
  setSelectedSearchIndex,
  setExpanded,
  updateSearchQuery,
} = useEditorOutline({
  editor: props.editor,
  getContent: () => props.content,
})
</script>

<template>
  <aside
    v-if="outline.length"
    class="editor-outline"
    @mouseenter="setExpanded(true)"
    @mouseleave="setExpanded(false)"
  >
    <section v-if="isExpanded" class="editor-outline__panel">
      <ElInput
        class="editor-outline__search-input"
        :model-value="searchQuery"
        clearable
        placeholder="搜索当前文档"
        @update:model-value="updateSearchQuery"
        @keydown="handleSearchKeydown"
      />

      <section v-if="searchQuery.trim()" class="editor-outline__section">
        <div class="editor-outline__section-title">
          搜索结果
        </div>

        <ul v-if="searchResults.length" class="editor-outline__result-list">
          <li
            v-for="(item, index) in searchResults"
            :key="item.blockId"
            class="editor-outline__item editor-outline__search-item"
            :class="{ 'is-active': isSearchResultSelected(item.blockId) }"
            @mouseenter="setSelectedSearchIndex(index)"
          >
            <div class="editor-outline__item-row">
              <a
                class="editor-outline__item-link"
                :href="getBlockHref(item.blockId)"
                @click.prevent="selectBlock(item.blockId)"
              >
                <span class="editor-outline__item-text">
                  {{ getSearchResultText(item.plainText) }}
                </span>
              </a>
            </div>
          </li>
        </ul>

        <div v-else class="editor-outline__empty">
          未找到匹配块
        </div>
      </section>

      <section class="editor-outline__section">
        <div class="editor-outline__section-title">
          大纲
        </div>

        <ol class="editor-outline__outline-list">
          <li
            v-for="item in outline"
            :key="item.blockId"
            class="editor-outline__item editor-outline__outline-item"
            :class="{ 'is-active': isActiveOutlineBlock(item.blockId) }"
            :data-heading-level="item.headingLevel"
            :style="{ '--editor-outline-indent': resolveOutlineIndent(item.headingLevel) }"
          >
            <div class="editor-outline__item-row">
              <a
                class="editor-outline__item-link"
                :href="getBlockHref(item.blockId)"
                :aria-current="isActiveOutlineBlock(item.blockId) ? 'true' : undefined"
                @click.prevent="selectBlock(item.blockId)"
              >
                <span class="editor-outline__item-text">
                  {{ getHeadingText(item) }}
                </span>
              </a>
            </div>
          </li>
        </ol>
      </section>
    </section>

    <ol class="editor-outline__rail">
      <li
        v-for="item in outline"
        :key="item.blockId"
        class="editor-outline__indicator"
        :class="{ 'is-active': isActiveOutlineBlock(item.blockId) }"
      >
        <a
          class="editor-outline__indicator-link"
          :href="getBlockHref(item.blockId)"
          @click.prevent="selectBlock(item.blockId)"
        >
          <span
            class="editor-outline__indicator-line"
            :style="{ width: resolveOutlineIndicatorWidth(item.headingLevel) }"
          />
        </a>
      </li>
    </ol>
  </aside>
</template>

<style scoped lang="scss">
.editor-outline {
  position: sticky;
  top: 1rem;
  z-index: 5;
  grid-area: 1 / 1;
  display: flex;
  justify-self: end;
  align-self: start;
  width: max-content;
  align-items: flex-start;
  gap: 0.5rem;
  pointer-events: auto;

  &__rail {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.375rem;
    margin: 0;
    padding-top: 0.125rem;
    padding-left: 0;
    list-style: none;
  }

  &__indicator {
    display: flex;
    justify-content: flex-end;
    width: 22px;
  }

  &__indicator-link {
    display: flex;
    justify-content: flex-end;
    width: 100%;
  }

  &__panel {
    display: grid;
    gap: 0.25rem;
    min-width: 9rem;
    max-width: 15rem;
    width: max-content;
    padding: 0.75rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 72%, transparent);
    border-radius: 1rem;
    background: color-mix(in srgb, white 94%, var(--brand-bg-surface) 6%);
    box-shadow: 0 14px 32px color-mix(in srgb, var(--brand-primary) 8%, transparent);
    opacity: 0;
    transform: translateX(10px);
    pointer-events: none;
    transition: opacity 0.18s ease, transform 0.18s ease;
  }

  &__search-input {
    margin-bottom: 0.25rem;

    :deep(.el-input__wrapper) {
      background: color-mix(in srgb, white 88%, var(--brand-bg-surface) 12%);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand-border-base) 74%, transparent) inset;
    }

    :deep(.el-input__inner) {
      font-size: 13px;
      line-height: 1.4;
    }
  }

  &__section {
    display: grid;
    gap: 0.25rem;
  }

  &__section-title {
    padding: 0.125rem 0.25rem;
    color: var(--brand-text-secondary);
    font-size: 12px;
    font-weight: 600;
  }

  &__result-list {
    display: grid;
    gap: 0.25rem;
    margin: 0;
    padding-left: 0;
    list-style: none;
  }

  &__outline-list {
    display: grid;
    gap: 0.25rem;
    margin: 0;
    padding-left: 0;
    list-style: none;
  }

  &__item {
    --editor-outline-indent: 0rem;
    min-width: 0;
    border-radius: 0.5rem;
    color: color-mix(in srgb, var(--brand-text-primary) 78%, transparent);
    transition: background-color 0.16s ease, color 0.16s ease;
  }

  &__item-row {
    display: flex;
    align-items: stretch;
    gap: 0.125rem;
    min-width: 0;
  }

  &__item-link {
    display: flex;
    align-items: center;
    flex: 1;
    width: 100%;
    min-width: 0;
    padding: 0.375rem 0.5rem;
    padding-inline-start: calc(0.5rem + var(--editor-outline-indent));
    color: inherit;
    text-align: left;
    text-decoration: none;
    border-radius: inherit;

    &:hover,
    &:focus-visible {
      background: color-mix(in srgb, var(--brand-primary) 10%, white);
      color: var(--brand-text-primary);
    }
  }

  &__indicator-line {
    display: block;
    height: 2px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--brand-text-secondary) 22%, transparent);
    transition: background-color 0.16s ease;
  }

  &__item-text {
    overflow: hidden;
    color: inherit;
    font-size: 14px;
    line-height: 1.4;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__empty {
    padding: 0.125rem 0.25rem;
    color: var(--brand-text-secondary);
    font-size: 12px;
    line-height: 1.5;
  }

  &__indicator.is-active .editor-outline__indicator-line {
    background: color-mix(in srgb, var(--brand-primary) 78%, white);
  }

  &__item.is-active {
    background: color-mix(in srgb, var(--brand-primary) 14%, white);
    color: var(--brand-text-primary);
  }

  &__panel {
    opacity: 1;
    transform: translateX(0);
    pointer-events: auto;
  }
}
</style>
