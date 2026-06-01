<script setup lang="ts">
import AiProviderConsole from '@/components/ai-provider-console'
import PagePanel from '@/layouts/panels/page-panel'
import AdminPageHeader from '../../components/page-header'
</script>

<template>
  <PagePanel>
    <template #header>
      <AdminPageHeader title="服务商" />
    </template>

    <div class="admin-providers-page h-full min-h-0 bg-fill-lighter p-4 lg:p-6">
      <AiProviderConsole class="admin-providers h-full min-h-0" mode="platform" />
    </div>
  </PagePanel>
</template>
