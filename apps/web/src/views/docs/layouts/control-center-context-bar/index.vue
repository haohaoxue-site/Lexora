<script setup lang="ts">
import type { DocsControlCenterContextBarModel } from './typing'

const activeTab = defineModel<DocsControlCenterContextBarModel>({ required: true })
</script>

<template>
  <ElTabs v-model="activeTab" class="docs-control-center-context-bar flex h-full max-w-full w-fit items-center">
    <ElTabPane name="collaborations">
      <template #label>
        <span class="inline-flex h-[var(--default-header-height)] items-center pr-[calc(var(--spacing)*4)] text-base font-semibold leading-[var(--default-header-height)]">
          协作
        </span>
      </template>
    </ElTabPane>
    <ElTabPane name="publications">
      <template #label>
        <span class="inline-flex h-[var(--default-header-height)] items-center px-[calc(var(--spacing)*4)] text-base font-semibold leading-[var(--default-header-height)]">
          发布
        </span>
      </template>
    </ElTabPane>
    <ElTabPane name="trash">
      <template #label>
        <span class="inline-flex h-[var(--default-header-height)] items-center px-[calc(var(--spacing)*4)] text-base font-semibold leading-[var(--default-header-height)]">
          回收站
        </span>
      </template>
    </ElTabPane>
  </ElTabs>
</template>

<style scoped lang="scss">
.docs-control-center-context-bar {
  :deep(.el-tabs__header) {
    height: 100%;
    margin: 0;
  }

  :deep(.el-tabs__nav-wrap) {
    height: 100%;
  }

  :deep(.el-tabs__nav-scroll),
  :deep(.el-tabs__nav) {
    height: 100%;
  }

  :deep(.el-tabs__nav-wrap::after) {
    display: none;
  }

  :deep(.el-tabs__active-bar) {
    height: 0.1875rem;
    background: var(--brand-primary);
  }

  :deep(.el-tabs__item) {
    height: 100%;
    color: var(--brand-text-secondary);
    padding: 0;
  }

  :deep(.el-tabs__item.is-active),
  :deep(.el-tabs__item:not(.is-disabled):hover) {
    color: var(--brand-primary);
  }

  :deep(.el-tabs__content) {
    display: none;
  }
}
</style>
