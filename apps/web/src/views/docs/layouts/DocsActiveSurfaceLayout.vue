<script setup lang="ts">
import DocsSidebarLayout from './DocsSidebarLayout.vue'
</script>

<template>
  <div class="docs-view">
    <DocsSidebarLayout />

    <RouterView />
  </div>
</template>

<style scoped lang="scss">
.docs-view {
  display: flex;
  height: 100%;
  min-height: 0;
}
</style>
