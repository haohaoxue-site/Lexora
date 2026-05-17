<script setup lang="ts">
import PagePanel from '@/layouts/panels/PagePanel.vue'
import AiProviderConsole from '@/views/provider/components/AiProviderConsole.vue'
import SystemAdminPageHeader from '../components/SystemAdminPageHeader.vue'
</script>

<template>
  <PagePanel>
    <template #header>
      <SystemAdminPageHeader title="服务商" />
    </template>

    <div class="admin-providers-page h-full min-h-0 bg-fill-lighter p-4 lg:p-6">
      <AiProviderConsole class="admin-providers h-full min-h-0" mode="platform" />
    </div>
  </PagePanel>
</template>
