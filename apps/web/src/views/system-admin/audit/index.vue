<script setup lang="ts">
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
  <div class="admin-audit">
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
</template>
