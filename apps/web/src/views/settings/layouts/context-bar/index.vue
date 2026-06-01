<script setup lang="ts">
import type { SettingsContextBarModel } from './typing'

const activeTab = defineModel<SettingsContextBarModel>({ required: true })
</script>

<template>
  <ElTabs v-model="activeTab" class="settings-context-bar flex h-full max-w-full w-fit items-center">
    <ElTabPane name="user">
      <template #label>
        <span class="inline-flex h-[var(--default-header-height)] items-center pr-[calc(var(--spacing)*4)] text-base font-semibold leading-[var(--default-header-height)]">
          账号
        </span>
      </template>
    </ElTabPane>
    <ElTabPane name="preference">
      <template #label>
        <span class="inline-flex h-[var(--default-header-height)] items-center px-[calc(var(--spacing)*4)] text-base font-semibold leading-[var(--default-header-height)]">
          偏好
        </span>
      </template>
    </ElTabPane>
    <ElTabPane name="providers">
      <template #label>
        <span class="inline-flex h-[var(--default-header-height)] items-center px-[calc(var(--spacing)*4)] text-base font-semibold leading-[var(--default-header-height)]">
          服务商
        </span>
      </template>
    </ElTabPane>
    <ElTabPane name="models-default">
      <template #label>
        <span class="inline-flex h-[var(--default-header-height)] items-center px-[calc(var(--spacing)*4)] text-base font-semibold leading-[var(--default-header-height)]">
          默认模型
        </span>
      </template>
    </ElTabPane>
  </ElTabs>
</template>

<style scoped lang="scss">
.settings-context-bar {
  :deep(.el-tabs__header) {
    margin: 0;
    height: 100%;
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

  :deep(.el-tabs__item.is-active) {
    color: var(--brand-primary);
  }

  :deep(.el-tabs__item:not(.is-disabled):hover) {
    color: var(--brand-primary);
  }

  :deep(.el-tabs__content) {
    display: none;
  }
}
</style>
