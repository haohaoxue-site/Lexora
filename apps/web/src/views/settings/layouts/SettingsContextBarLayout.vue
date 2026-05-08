<script setup lang="ts">
import type { SettingsTabName } from '../typing'

const activeTab = defineModel<SettingsTabName>({ required: true })
</script>

<template>
  <ElTabs v-model="activeTab" class="settings-context-bar">
    <ElTabPane label="账号" name="user" />
    <ElTabPane label="偏好" name="preference" />
    <ElTabPane label="默认模型" name="models-default" />
  </ElTabs>
</template>

<style scoped lang="scss">
.settings-context-bar {
  display: flex;
  align-items: center;
  width: fit-content;
  max-width: 100%;
  height: 100%;

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
    padding: 0 calc(var(--spacing) * 4);
    color: var(--brand-text-secondary);
    font-size: 1rem;
    font-weight: 600;
    line-height: var(--page-panel-header-height);
  }

  :deep(.el-tabs__item:first-child) {
    padding-left: 0;
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
