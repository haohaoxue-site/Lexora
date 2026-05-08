<script setup lang="ts">
import { RouterView } from 'vue-router'
import SessionUserMenu from '@/layouts/components/SessionUserMenu.vue'
import { useAdminShell } from '@/layouts/composables/useAdminShell'
import AdminSidebarPanel from '@/layouts/panels/AdminSidebarPanel.vue'
import { ADMIN_ROUTE_NAME } from '@/router/constants'

const { currentNavigationLabel, navigationItems } = useAdminShell()
</script>

<template>
  <div class="admin-shell">
    <AdminSidebarPanel :items="navigationItems" />

    <main class="admin-shell__main">
      <header class="admin-shell__header">
        <ElBreadcrumb separator="/" class="admin-shell__breadcrumb">
          <ElBreadcrumbItem :to="{ name: ADMIN_ROUTE_NAME }">
            系统后台
          </ElBreadcrumbItem>
          <ElBreadcrumbItem v-if="currentNavigationLabel">
            {{ currentNavigationLabel }}
          </ElBreadcrumbItem>
        </ElBreadcrumb>

        <div class="admin-shell__user-menu">
          <SessionUserMenu />
        </div>
      </header>

      <section class="admin-shell__content">
        <RouterView v-slot="{ Component }">
          <component :is="Component" class="h-full w-full overflow-hidden" />
        </RouterView>
      </section>
    </main>
  </div>
</template>

<style scoped lang="scss">
.admin-shell {
  display: flex;
  height: 100dvh;
  overflow: hidden;
  background: var(--brand-fill-light);
  color: var(--brand-text-primary);
  font-family: var(--el-font-family);

  .admin-shell__main {
    position: relative;
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  .admin-shell__header {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 4.25rem;
    padding: 0.875rem 1.5rem;
    border-bottom: 1px solid var(--brand-border-base);
    background: var(--brand-bg-surface);
  }

  .admin-shell__breadcrumb {
    min-width: 0;

    :deep(.el-breadcrumb__inner) {
      color: var(--brand-text-secondary);
      font-size: 0.8125rem;
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

  .admin-shell__user-menu {
    display: flex;
    justify-content: flex-end;
    align-items: center;
  }

  .admin-shell__content {
    flex: 1 1 0%;
    min-height: 0;
    padding: 1rem 1.5rem 1.5rem;
    overflow: hidden;
    background: var(--brand-fill-lighter);
  }
}
</style>
