<script setup lang="ts">
import WorkspaceContextBar from './WorkspaceContextBar.vue'

withDefaults(defineProps<{
  showContextBar?: boolean
}>(), {
  showContextBar: true,
})
</script>

<template>
  <div class="workspace-page">
    <WorkspaceContextBar v-if="showContextBar">
      <template #context>
        <slot name="context" />
      </template>
    </WorkspaceContextBar>

    <div class="workspace-page__body">
      <slot />
    </div>
  </div>
</template>

<style scoped lang="scss">
.workspace-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--brand-bg-surface);

  .workspace-page__body {
    flex: 1 1 0%;
    min-height: 0;
    overflow-y: auto;
  }
}
</style>
