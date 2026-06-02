<script setup lang="ts">
import { computed } from 'vue'
import { SvgIcon } from '@/components/svg-icon'
import { useUiStore } from '@/stores/ui'
import { useDocsChatPanel } from '../../composables/useDocsChatPanel'
import { useDocsSurfaceState } from '../../composables/useDocsSurfaceState'
import DocsChatPanel from '../../widgets/chat-panel'
import DocsSidebarLayout from '../sidebar'

const uiStore = useUiStore()
const { currentSurface, isDocumentSurface } = useDocsSurfaceState()
const { isOpen: isDocsChatPanelOpen } = useDocsChatPanel()
const isControlCenterSurface = computed(() => currentSurface.value !== 'document')
const isDocumentLibraryVisible = computed(() =>
  !uiStore.documentLibrarySidebarCollapsed && !isControlCenterSurface.value,
)

function showDocumentLibrary() {
  uiStore.setDocumentLibrarySidebarCollapsed(false)
}
</script>

<template>
  <div class="docs-view relative flex h-full min-h-0">
    <DocsSidebarLayout v-if="isDocumentLibraryVisible" />

    <ElTooltip
      v-else-if="!isControlCenterSurface"
      content="显示文档库"
      effect="dark"
      placement="right"
      :show-after="120"
    >
      <ElButton
        text
        class="docs-view__library-restore absolute left-3 top-3 z-[5] h-8 min-w-8 w-8 rounded-lg p-0"
        title="显示文档库"
        aria-label="显示文档库"
        @click="showDocumentLibrary"
      >
        <SvgIcon category="ui" icon="pin" size="1rem" />
      </ElButton>
    </ElTooltip>

    <main class="docs-view__surface flex min-h-0 min-w-0 flex-1">
      <RouterView />
    </main>

    <DocsChatPanel v-show="isDocumentSurface && isDocsChatPanelOpen" />
  </div>
</template>

<style scoped lang="scss">
.docs-view__library-restore {
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
