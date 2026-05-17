<script setup lang="ts">
import { computed } from 'vue'
import { SvgIcon } from '@/components/svg-icon'
import { useUiStore } from '@/stores/ui'
import DocsSidebarLayout from './DocsSidebarLayout.vue'

const uiStore = useUiStore()
const isDocumentLibraryVisible = computed(() => !uiStore.documentLibrarySidebarCollapsed)

function showDocumentLibrary() {
  uiStore.setDocumentLibrarySidebarCollapsed(false)
}
</script>

<template>
  <div class="docs-view">
    <DocsSidebarLayout v-if="isDocumentLibraryVisible" />

    <ElTooltip
      v-else
      content="显示文档库"
      effect="dark"
      placement="right"
      :show-after="120"
    >
      <ElButton
        text
        circle
        class="docs-view__library-restore"
        title="显示文档库"
        @click="showDocumentLibrary"
      >
        <SvgIcon category="ui" icon="pin" size="1rem" />
      </ElButton>
    </ElTooltip>

    <RouterView />
  </div>
</template>

<style scoped lang="scss">
.docs-view {
  position: relative;
  display: flex;
  height: 100%;
  min-height: 0;
}

.docs-view__library-restore {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  z-index: 5;
  width: 2rem;
  height: 2rem;
  border: 1px solid color-mix(in srgb, var(--brand-border-base) 72%, transparent);
  background: color-mix(in srgb, var(--brand-bg-surface) 92%, transparent);
  color: var(--brand-text-secondary);
  box-shadow: 0 0.5rem 1.25rem color-mix(in srgb, var(--brand-text-primary) 8%, transparent);

  &:hover,
  &:focus-visible {
    background: color-mix(in srgb, var(--brand-primary) 7%, var(--brand-bg-surface));
    color: var(--brand-primary);
  }
}
</style>
