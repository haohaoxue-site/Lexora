<script setup lang="ts">
import type { DocumentPageWidthMode } from '@haohaoxue/samepage-contracts'
import {
  DOCUMENT_PAGE_WIDTH_MODE,
  DOCUMENT_PAGE_WIDTH_MODE_LABELS,
  DOCUMENT_PAGE_WIDTH_MODE_VALUES,
} from '@haohaoxue/samepage-contracts'
import { useDocumentHeaderActions } from '../composables/useDocumentHeaderActions'

interface PageWidthOptionView {
  value: DocumentPageWidthMode
  label: string
  previewClass: string
}

const pageWidthPreviewClass: Record<DocumentPageWidthMode, string> = {
  [DOCUMENT_PAGE_WIDTH_MODE.NARROW]: 'is-narrow',
  [DOCUMENT_PAGE_WIDTH_MODE.DEFAULT]: 'is-default',
  [DOCUMENT_PAGE_WIDTH_MODE.FULL]: 'is-full',
}

const pageWidthOptions: PageWidthOptionView[] = DOCUMENT_PAGE_WIDTH_MODE_VALUES.map(value => ({
  value,
  label: DOCUMENT_PAGE_WIDTH_MODE_LABELS[value],
  previewClass: pageWidthPreviewClass[value],
}))

const {
  copyShareLink,
  currentPageWidthMode,
  handleMenuCommand,
  handlePageWidthOptionClick,
  isShareButtonDisabled,
  isShareLinkCopied,
  openShareDialog,
  shouldShowShareLink,
} = useDocumentHeaderActions()
</script>

<template>
  <div class="document-header-actions">
    <ElButton
      text
      class="document-header-actions__share-button font-normal"
      :disabled="isShareButtonDisabled"
      title="分享"
      @click="openShareDialog"
    >
      <span class="document-header-actions__button-content">
        <SvgIcon category="ui" icon="lock" />
        <span class="document-header-actions__share-label">分享</span>
        <SvgIcon category="ui" icon="chevron-down" class="document-header-actions__share-caret" />
      </span>
    </ElButton>

    <ElTooltip
      v-if="shouldShowShareLink"
      :content="isShareLinkCopied ? '已复制' : '复制分享链接'"
      effect="dark"
      placement="bottom"
      :show-after="120"
    >
      <ElButton
        text
        class="document-header-actions__icon-button"
        :class="{ 'is-copied': isShareLinkCopied }"
        title="复制分享链接"
        @click="copyShareLink"
      >
        <SvgIcon category="ui" icon="link" />
      </ElButton>
    </ElTooltip>

    <ElDropdown
      trigger="click"
      popper-class="document-header-actions__more-popper"
      @command="handleMenuCommand"
    >
      <ElButton
        text
        class="document-header-actions__icon-button"
        title="更多"
      >
        <SvgIcon category="ui" icon="more" />
      </ElButton>

      <template #dropdown>
        <ElDropdownMenu>
          <ElPopover
            trigger="hover"
            placement="left-start"
            :width="316"
            :show-arrow="false"
            :show-after="80"
            :hide-after="80"
            :popper-style="{ padding: '0' }"
          >
            <template #reference>
              <li
                class="el-dropdown-menu__item"
                role="menuitem"
                tabindex="0"
              >
                <span class="document-header-actions__menu-icon">
                  <SvgIcon category="ui" icon="page-width" size="1rem" />
                </span>
                <span class="document-header-actions__menu-label">页宽设置</span>
                <span class="document-header-actions__menu-caret">
                  <SvgIcon category="ui" icon="chevron-right" />
                </span>
              </li>
            </template>

            <section class="document-page-width-menu">
              <div class="document-page-width-menu__title">
                为当前文档选择合适页宽
              </div>

              <div class="document-page-width-menu__options">
                <button
                  v-for="option in pageWidthOptions"
                  :key="option.value"
                  type="button"
                  class="document-page-width-menu__option"
                  :class="[
                    option.previewClass,
                    { 'is-active': currentPageWidthMode === option.value },
                  ]"
                  @click="handlePageWidthOptionClick(option.value)"
                >
                  <span class="document-page-width-menu__preview" aria-hidden="true">
                    <span class="document-page-width-menu__preview-surface">
                      <span class="document-page-width-menu__preview-line is-primary" />
                      <span class="document-page-width-menu__preview-line" />
                      <span class="document-page-width-menu__preview-line is-short" />
                    </span>
                  </span>
                  <span class="document-page-width-menu__label">
                    {{ option.label }}
                  </span>
                </button>
              </div>
            </section>
          </ElPopover>

          <ElDropdownItem
            command="document-info"
            divided
          >
            <template #icon>
              <SvgIcon category="ui" icon="info" size="1rem" />
            </template>
            文档信息
          </ElDropdownItem>

          <ElDropdownItem
            command="history"
          >
            <template #icon>
              <SvgIcon category="ui" icon="history" size="1rem" />
            </template>
            历史记录
          </ElDropdownItem>
        </ElDropdownMenu>
      </template>
    </ElDropdown>
  </div>
</template>

<style scoped lang="scss">
.document-header-actions {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: var(--brand-text-primary);

  .document-header-actions__share-button {
    --el-button-text-color: color-mix(in srgb, var(--brand-text-primary) 78%, var(--brand-text-secondary));
    --el-button-hover-text-color: var(--brand-text-primary);
    --el-button-active-text-color: var(--brand-text-primary);
    --el-button-border-color: color-mix(in srgb, var(--brand-border-base) 84%, transparent);
    --el-button-hover-border-color: color-mix(in srgb, var(--brand-text-primary) 18%, transparent);
    --el-button-active-border-color: color-mix(in srgb, var(--brand-text-primary) 22%, transparent);
    --el-button-bg-color: var(--brand-bg-surface);
    --el-button-hover-bg-color: color-mix(in srgb, var(--brand-fill-lighter) 72%, white);
    --el-button-active-bg-color: color-mix(in srgb, var(--brand-fill-lighter) 86%, white);
    height: 1.75rem;
    min-height: 1.75rem;
    padding: 0 0.5625rem;
    border: 1px solid var(--el-button-border-color);
    border-radius: 0.4375rem;
    background: var(--el-button-bg-color);

    &:disabled {
      opacity: 0.48;
    }
  }

  .document-header-actions__button-content {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 12px;
  }

  .document-header-actions__share-label {
    font-size: 12px;
    line-height: 1;
  }

  .document-header-actions__share-caret {
    color: var(--brand-text-secondary);
    font-size: 10px;
  }

  .document-header-actions__icon-button {
    --el-button-text-color: var(--brand-text-primary);
    --el-button-hover-text-color: var(--brand-text-primary);
    --el-button-active-text-color: var(--brand-text-primary);
    --el-button-hover-bg-color: color-mix(in srgb, var(--brand-fill-lighter) 70%, white);
    --el-button-active-bg-color: color-mix(in srgb, var(--brand-fill-lighter) 84%, white);
    width: 2rem;
    min-width: 2rem;
    height: 2rem;
    padding: 0;
    border-radius: 0.5rem;
    color: var(--brand-text-primary);
    font-size: 18px;

    &.is-copied {
      color: var(--brand-success);
    }
  }
}

.document-header-actions__menu-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 1rem;
  height: 1rem;
  color: color-mix(in srgb, var(--brand-text-secondary) 86%, transparent);
}

.document-header-actions__menu-label {
  flex: 1 1 0%;
  min-width: 0;
  overflow: hidden;
  font-size: 14px;
  line-height: 1.25rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-header-actions__menu-caret {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 0.875rem;
  height: 0.875rem;
  color: color-mix(in srgb, var(--brand-text-secondary) 72%, transparent);
  font-size: 14px;
}

.document-page-width-menu {
  padding: 0.5rem 0.5625rem 0.625rem;

  .document-page-width-menu__title {
    margin-bottom: 0.5rem;
    color: color-mix(in srgb, var(--brand-text-secondary) 88%, transparent);
    font-size: 12px;
    line-height: 1.25rem;
  }

  .document-page-width-menu__options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.4375rem;
  }

  .document-page-width-menu__option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
    padding: 0.375rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 80%, transparent);
    border-radius: 0.5rem;
    background: var(--brand-bg-surface);
    color: var(--brand-text-primary);
    cursor: pointer;
    transition:
      border-color 0.18s ease,
      background-color 0.18s ease,
      color 0.18s ease;

    &:hover,
    &:focus-visible {
      border-color: color-mix(in srgb, var(--brand-primary) 24%, transparent);
      background: color-mix(in srgb, var(--brand-primary) 4%, white);
      outline: none;
    }

    &.is-active {
      border-color: color-mix(in srgb, var(--brand-primary) 54%, transparent);
      background: color-mix(in srgb, var(--brand-primary) 8%, white);
      color: var(--brand-primary);
    }
  }

  .document-page-width-menu__preview {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.625rem;
    height: 2.875rem;
    border-radius: 0.375rem;
    background: color-mix(in srgb, var(--brand-fill-lighter) 82%, white);
  }

  .document-page-width-menu__preview-surface {
    display: flex;
    flex-direction: column;
    gap: 0.1875rem;
    width: 2rem;
    padding: 0.3125rem 0.25rem;
    border-radius: 0.25rem;
    background: color-mix(in srgb, var(--brand-bg-surface) 86%, white);
  }

  .document-page-width-menu__option.is-narrow .document-page-width-menu__preview-surface {
    width: 1.5rem;
  }

  .document-page-width-menu__option.is-full .document-page-width-menu__preview-surface {
    width: 2.875rem;
  }

  .document-page-width-menu__preview-line {
    display: block;
    width: 100%;
    height: 0.15625rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--brand-text-secondary) 32%, transparent);

    &.is-primary {
      background: color-mix(in srgb, var(--brand-primary) 42%, white);
    }

    &.is-short {
      width: 72%;
    }
  }

  .document-page-width-menu__label {
    font-size: 13px;
    font-weight: 500;
    line-height: 1.25rem;
  }
}

:global(.document-header-actions__more-popper) {
  --el-dropdown-menuItem-hover-color: var(--brand-text-primary);
  --el-dropdown-menuItem-hover-fill: color-mix(in srgb, var(--brand-fill-lighter) 76%, var(--brand-text-primary) 6%);
}

:global(.document-header-actions__more-popper .el-dropdown-menu) {
  box-sizing: border-box;
  width: 9.25rem;
  min-width: 0;
  max-width: 9.25rem;
  padding: 0.3125rem;
}

:global(.document-header-actions__more-popper .el-dropdown-menu__item) {
  gap: 0.5rem;
  box-sizing: border-box;
  width: 100%;
  min-height: 2.125rem;
  padding: 0 0.5rem;
  border-radius: 0.375rem;
  color: var(--brand-text-primary);
}

:global(.document-header-actions__more-popper .el-dropdown-menu__item .el-icon) {
  margin-right: 0;
  color: color-mix(in srgb, var(--brand-text-secondary) 86%, transparent);
  font-size: 16px;
}

:global(.document-header-actions__more-popper .el-dropdown-menu__item--divided) {
  margin: 0.375rem 0;
  border-top-color: color-mix(in srgb, var(--brand-border-base) 72%, transparent);
}

:global(.document-header-actions__more-popper .el-dropdown-menu__item:not(.is-disabled):focus:not(:focus-visible):not(:hover)) {
  background-color: transparent;
  color: var(--brand-text-primary);
}
</style>
