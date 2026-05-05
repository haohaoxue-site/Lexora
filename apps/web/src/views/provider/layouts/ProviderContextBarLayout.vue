<script setup lang="ts">
import type { ProviderTabName } from '../typing'

const activeTab = defineModel<ProviderTabName>({ required: true })
</script>

<template>
  <div class="provider-context-bar">
    <h1 class="m-0 text-xl font-bold leading-7 text-main">
      模型服务
    </h1>

    <ElTabs v-model="activeTab" class="provider-context-bar__tabs">
      <ElTabPane label="服务商与模型" name="models" />
      <ElTabPane label="默认模型" name="usage" />
    </ElTabs>
  </div>
</template>

<style scoped lang="scss">
.provider-context-bar {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  height: 100%;
  gap: 0.5rem;
}

.provider-context-bar__tabs {
  width: fit-content;
  max-width: 100%;

  :deep(.el-tabs__header) {
    margin: 0;
  }

  :deep(.el-tabs__nav-wrap::after) {
    display: none;
  }

  :deep(.el-tabs__active-bar) {
    height: 0.125rem;
    border-radius: 999px;
    background: var(--brand-primary);
  }

  :deep(.el-tabs__item) {
    height: 2rem;
    padding: 0 1.125rem;
    color: var(--brand-text-secondary);
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 2rem;
  }

  :deep(.el-tabs__item:first-child) {
    padding-left: 0;
  }

  :deep(.el-tabs__item.is-active) {
    color: var(--brand-primary);
  }

  :deep(.el-tabs__content) {
    display: none;
  }
}
</style>
