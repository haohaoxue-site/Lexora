<script setup lang="ts">
import { PanelLeft20Regular } from '@vicons/fluent'
import { NButton, NIcon } from 'naive-ui'

defineProps<{
  label: string
  visible: boolean
}>()
const emit = defineEmits<{
  restore: []
}>()
</script>

<template>
  <div class="desktop-workspace-sidebar-identity">
    <Transition name="desktop-workspace-sidebar-identity">
      <div v-if="visible" class="desktop-workspace-sidebar-identity__content">
        <NButton
          class="buddy-icon-button desktop-workspace-sidebar-identity__restore"
          quaternary
          @click="emit('restore')"
        >
          <template #icon>
            <NIcon :component="PanelLeft20Regular" />
          </template>
        </NButton>
        <strong class="desktop-workspace-sidebar-identity__label">{{ label }}</strong>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.desktop-workspace-sidebar-identity {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
}

.desktop-workspace-sidebar-identity__content {
  display: flex;
  min-width: 0;
  align-items: center;
  color: var(--buddy-nav-foreground);
  gap: 0.35rem;
  transition:
    opacity 220ms ease-out,
    transform 360ms cubic-bezier(0.16, 1, 0.3, 1);
  transition-delay: 70ms;
}

.desktop-workspace-sidebar-identity__restore.n-button {
  color: var(--buddy-nav-foreground);
}

.desktop-workspace-sidebar-identity__label {
  overflow: hidden;
  font-size: var(--buddy-sidebar-header-font-size);
  font-weight: var(--buddy-sidebar-header-font-weight);
  text-overflow: ellipsis;
  transition:
    opacity 180ms ease-out,
    transform 300ms cubic-bezier(0.16, 1, 0.3, 1);
  transition-delay: 150ms;
  white-space: nowrap;
}

.desktop-workspace-sidebar-identity-enter-active {
  will-change: opacity, transform;
}

.desktop-workspace-sidebar-identity-enter-from {
  opacity: 0;
  transform: translateX(-2rem);
}

.desktop-workspace-sidebar-identity-enter-from .desktop-workspace-sidebar-identity__label {
  opacity: 0;
  transform: translateX(-0.625rem);
}

.desktop-workspace-sidebar-identity-leave-active {
  transition-delay: 0ms;
  transition-duration: 100ms, 140ms;
  transition-timing-function: ease-in, cubic-bezier(0.4, 0, 1, 1);
  will-change: opacity, transform;
}

.desktop-workspace-sidebar-identity-leave-to {
  opacity: 0;
  transform: translateX(-0.5rem);
}

@media (prefers-reduced-motion: reduce) {
  .desktop-workspace-sidebar-identity__content,
  .desktop-workspace-sidebar-identity__label {
    transition: none;
  }
}
</style>
