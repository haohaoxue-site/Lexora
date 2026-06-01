<script setup lang="ts">
import type { DocumentPageWidthMode } from '@haohaoxue/samepage-contracts'
import type { PageWidthOptionView } from './typing'
import {
  DOCUMENT_PAGE_WIDTH_MODE,
  DOCUMENT_PAGE_WIDTH_MODE_LABELS,
  DOCUMENT_PAGE_WIDTH_MODE_VALUES,
} from '@haohaoxue/samepage-contracts'
import { useDocumentHeaderActions } from '../../composables/useDocumentHeaderActions'

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
  currentPageWidthMode,
  canShowCollaborationButton,
  canShowPublicationButton,
  handleMenuCommand,
  handlePageWidthOptionClick,
  isDocsChatPanelOpen,
  openCollaborationDialog,
  openPublicationDialog,
  toggleDocsChatPanel,
} = useDocumentHeaderActions()
</script>

<template>
  <div class="document-header-actions flex items-center gap-1.5 text-main">
    <ElTooltip
      content="AI 对话"
      effect="dark"
      placement="bottom"
      :show-after="120"
    >
      <ElButton
        text
        class="document-header-actions__icon-button h-8 min-w-8 w-8 rounded-lg p-0 text-[18px]"
        :class="{ 'is-active': isDocsChatPanelOpen }"
        title="AI 对话"
        @click="toggleDocsChatPanel"
      >
        <SvgIcon category="ui" icon="chat" />
      </ElButton>
    </ElTooltip>

    <ElButton
      v-if="canShowCollaborationButton"
      text
      class="document-header-actions__share-button h-7 min-h-7 rounded-[0.4375rem] border px-[0.5625rem] font-normal"
      title="协作"
      @click="openCollaborationDialog"
    >
      <span class="inline-flex items-center gap-1 text-xs">
        <SvgIcon category="ui" icon="lock" />
        <span class="text-xs leading-none">协作</span>
        <SvgIcon category="ui" icon="chevron-down" class="text-[10px] text-secondary" />
      </span>
    </ElButton>

    <ElButton
      v-if="canShowPublicationButton"
      text
      class="document-header-actions__share-button h-7 min-h-7 rounded-[0.4375rem] border px-[0.5625rem] font-normal"
      title="分享"
      @click="openPublicationDialog"
    >
      <span class="inline-flex items-center gap-1 text-xs">
        <SvgIcon category="ui" icon="share-public" />
        <span class="text-xs leading-none">分享</span>
      </span>
    </ElButton>

    <ElDropdown
      trigger="click"
      popper-class="document-header-actions__more-popper"
      @command="handleMenuCommand"
    >
      <ElButton
        text
        class="document-header-actions__icon-button h-8 min-w-8 w-8 rounded-lg p-0 text-[18px]"
        title="更多"
      >
        <SvgIcon category="ui" icon="more" />
      </ElButton>

      <template #dropdown>
        <ElDropdownMenu class="document-header-actions__menu box-border min-w-0 max-w-[9.25rem] w-[9.25rem] p-[0.3125rem]">
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
                class="document-header-actions__menu-item el-dropdown-menu__item box-border flex min-h-[2.125rem] w-full items-center gap-2 rounded-md px-2 text-main"
                role="menuitem"
                tabindex="0"
              >
                <span class="inline-flex h-4 w-4 flex-none items-center justify-center text-[color-mix(in_srgb,var(--brand-text-secondary)_86%,transparent)]">
                  <SvgIcon category="ui" icon="page-width" size="1rem" />
                </span>
                <span class="min-w-0 flex-1 overflow-hidden text-sm leading-5 text-ellipsis whitespace-nowrap">
                  页宽设置
                </span>
                <span class="inline-flex h-[0.875rem] w-[0.875rem] flex-none items-center justify-center text-sm text-[color-mix(in_srgb,var(--brand-text-secondary)_72%,transparent)]">
                  <SvgIcon category="ui" icon="chevron-right" />
                </span>
              </li>
            </template>

            <section class="document-page-width-menu px-[0.5625rem] pb-[0.625rem] pt-2">
              <div class="mb-2 text-xs leading-5 text-secondary">
                为当前文档选择合适页宽
              </div>

              <div class="grid grid-cols-3 gap-[0.4375rem]">
                <button
                  v-for="option in pageWidthOptions"
                  :key="option.value"
                  type="button"
                  class="document-page-width-menu__option flex min-w-0 cursor-pointer flex-col items-center gap-1.5 rounded-lg border bg-surface p-1.5 text-main"
                  :class="[
                    option.previewClass,
                    { 'is-active': currentPageWidthMode === option.value },
                  ]"
                  @click="handlePageWidthOptionClick(option.value)"
                >
                  <span class="document-page-width-menu__preview flex h-[2.875rem] w-[3.625rem] items-center justify-center rounded-md" aria-hidden="true">
                    <span class="document-page-width-menu__preview-surface flex w-8 flex-col gap-[0.1875rem] rounded px-1 py-[0.3125rem]">
                      <span class="document-page-width-menu__preview-line h-[0.15625rem] rounded-full is-primary" />
                      <span class="document-page-width-menu__preview-line h-[0.15625rem] rounded-full" />
                      <span class="document-page-width-menu__preview-line h-[0.15625rem] w-[72%] rounded-full is-short" />
                    </span>
                  </span>
                  <span class="text-[13px] font-medium leading-5">
                    {{ option.label }}
                  </span>
                </button>
              </div>
            </section>
          </ElPopover>

          <ElDropdownItem
            command="document-info"
            divided
            class="document-header-actions__menu-item my-[0.375rem] min-h-[2.125rem] w-full box-border gap-2 rounded-md px-2 text-main"
          >
            <template #icon>
              <span class="inline-flex h-4 w-4 flex-none items-center justify-center text-[16px] text-[color-mix(in_srgb,var(--brand-text-secondary)_86%,transparent)]">
                <SvgIcon category="ui" icon="info" size="1rem" />
              </span>
            </template>
            文档信息
          </ElDropdownItem>

          <ElDropdownItem
            command="history"
            class="document-header-actions__menu-item min-h-[2.125rem] w-full box-border gap-2 rounded-md px-2 text-main"
          >
            <template #icon>
              <span class="inline-flex h-4 w-4 flex-none items-center justify-center text-[16px] text-[color-mix(in_srgb,var(--brand-text-secondary)_86%,transparent)]">
                <SvgIcon category="ui" icon="history" size="1rem" />
              </span>
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
    border: 1px solid var(--el-button-border-color);
    background: var(--el-button-bg-color);

    &:disabled {
      opacity: 0.48;
    }
  }

  .document-header-actions__icon-button {
    --el-button-text-color: var(--brand-text-primary);
    --el-button-hover-text-color: var(--brand-text-primary);
    --el-button-active-text-color: var(--brand-text-primary);
    --el-button-hover-bg-color: color-mix(in srgb, var(--brand-fill-lighter) 70%, white);
    --el-button-active-bg-color: color-mix(in srgb, var(--brand-fill-lighter) 84%, white);
    color: var(--brand-text-primary);

    &.is-copied {
      color: var(--brand-success);
    }

    &.is-active {
      background: color-mix(in srgb, var(--brand-primary) 8%, transparent);
      color: var(--brand-primary);
    }
  }
}

.document-page-width-menu {
  .document-page-width-menu__option {
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 80%, transparent);
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
    background: color-mix(in srgb, var(--brand-fill-lighter) 82%, white);
  }

  .document-page-width-menu__preview-surface {
    background: color-mix(in srgb, var(--brand-bg-surface) 86%, white);
  }

  .document-page-width-menu__option.is-narrow .document-page-width-menu__preview-surface {
    width: 1.5rem;
  }

  .document-page-width-menu__option.is-full .document-page-width-menu__preview-surface {
    width: 2.875rem;
  }

  .document-page-width-menu__preview-line {
    background: color-mix(in srgb, var(--brand-text-secondary) 32%, transparent);

    &.is-primary {
      background: color-mix(in srgb, var(--brand-primary) 42%, white);
    }
  }
}

:global(.document-header-actions__more-popper) {
  --el-dropdown-menuItem-hover-color: var(--brand-text-primary);
  --el-dropdown-menuItem-hover-fill: color-mix(in srgb, var(--brand-fill-lighter) 76%, var(--brand-text-primary) 6%);
}

:global(.document-header-actions__more-popper .el-dropdown-menu__item--divided) {
  border-top-color: color-mix(in srgb, var(--brand-border-base) 72%, transparent);
}

:global(.document-header-actions__more-popper .el-dropdown-menu__item:not(.is-disabled):focus:not(:focus-visible):not(:hover)) {
  background-color: transparent;
  color: var(--brand-text-primary);
}
</style>
