<script setup lang="ts">
import PagePanel from '@/layouts/panels/PagePanel.vue'
import AiProviderConsole from './components/AiProviderConsole.vue'
</script>

<template>
  <PagePanel>
    <template #header>
      <h1 class="provider-view__title">
        模型服务商
      </h1>
    </template>

    <AiProviderConsole mode="user" />
  </PagePanel>
</template>

<style scoped lang="scss">
.provider-view__title {
  margin: 0;
  color: var(--brand-text-primary);
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 2rem;
}
</style>
