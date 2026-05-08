<script setup lang="ts">
import { ADMIN_ROUTE_NAME } from '@/router/constants'

defineProps<{
  title: string
}>()
</script>

<template>
  <ElBreadcrumb separator="/" class="system-admin-page-header">
    <ElBreadcrumbItem :to="{ name: ADMIN_ROUTE_NAME }">
      系统后台
    </ElBreadcrumbItem>
    <ElBreadcrumbItem>
      {{ title }}
    </ElBreadcrumbItem>
  </ElBreadcrumb>
</template>

<style scoped lang="scss">
.system-admin-page-header {
  min-width: 0;

  :deep(.el-breadcrumb__inner) {
    color: var(--brand-text-secondary);
    font-weight: 500;
  }

  :deep(.el-breadcrumb__inner a) {
    color: var(--brand-text-secondary);
    font-weight: 500;
    transition: color 0.2s ease;

    &:hover {
      color: var(--brand-text-primary);
    }
  }

  :deep(.el-breadcrumb__item:last-child .el-breadcrumb__inner) {
    color: var(--brand-text-primary);
    font-weight: 600;
  }
}
</style>
