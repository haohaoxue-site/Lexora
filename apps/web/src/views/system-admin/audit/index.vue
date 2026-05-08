<script setup lang="ts">
import PagePanel from '@/layouts/panels/PagePanel.vue'
import SystemAdminPageHeader from '../components/SystemAdminPageHeader.vue'
import AuditTable from './components/AuditTable.vue'
import { useAudit } from './composables/useAudit'

const {
  isLoading,
  logs,
  query,
  total,
  updateFilters,
  updatePageNo,
  updatePageSize,
} = useAudit()
</script>

<template>
  <PagePanel>
    <template #header>
      <SystemAdminPageHeader title="审计" />
    </template>

    <div class="admin-audit h-full min-h-0 flex bg-fill-lighter p-4 lg:p-6">
      <AuditTable
        :logs="logs"
        :total="total"
        :page-no="query.pageNo"
        :page-size="query.pageSize"
        :loading="isLoading"
        :target-type="query.targetType ?? null"
        class="min-h-0 flex-1"
        @update-filters="updateFilters"
        @update-page-no="updatePageNo"
        @update-page-size="updatePageSize"
      />
    </div>
  </PagePanel>
</template>
