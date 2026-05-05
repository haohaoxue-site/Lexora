<script setup lang="ts">
import { RouterView } from 'vue-router'
import WorkspacePage from '@/layouts/components/WorkspacePage.vue'
import { useProviderRouteTabs } from './composables/useProviderRouteTabs'
import ProviderContextBarLayout from './layouts/ProviderContextBarLayout.vue'

const { activeTab } = useProviderRouteTabs()
</script>

<template>
  <WorkspacePage class="provider-shell">
    <template #context>
      <ProviderContextBarLayout v-model="activeTab" />
    </template>

    <RouterView />
  </WorkspacePage>
</template>

<style scoped lang="scss">
.provider-shell {
  :deep(.workspace-context-bar) {
    --workspace-context-bar-height: 6.5rem;
  }

  :deep(.workspace-context-bar__slot) {
    align-items: stretch;
  }
}
</style>
