<script setup lang="ts">
import SessionNotificationBell from './session-notification-bell/SessionNotificationBell.vue'
import SessionUserMenu from './SessionUserMenu.vue'
</script>

<template>
  <header class="workspace-context-bar">
    <div class="workspace-context-bar__content">
      <div class="workspace-context-bar__slot">
        <slot name="context" />
      </div>

      <div class="workspace-context-bar__actions">
        <SessionNotificationBell />
        <SessionUserMenu />
      </div>
    </div>
  </header>
</template>

<style scoped lang="scss">
.workspace-context-bar {
  --workspace-context-bar-height: 5.75rem;
  --workspace-context-bar-padding-block: 1rem;
  --workspace-context-bar-padding-inline: 1.5rem;

  position: sticky;
  top: 0;
  z-index: 20;
  height: var(--workspace-context-bar-height);
  padding: var(--workspace-context-bar-padding-block) var(--workspace-context-bar-padding-inline);
  border-bottom: 1px solid color-mix(in srgb, var(--brand-border-base) 80%, transparent);
  backdrop-filter: blur(24px);
  background: var(--brand-bg-overlay);

  .workspace-context-bar__content {
    display: flex;
    align-items: center;
    gap: 1rem;
    height: 100%;
    min-height: 0;
  }

  .workspace-context-bar__slot {
    display: flex;
    align-items: center;
    flex: 1 1 0%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .workspace-context-bar__actions {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 0.75rem;
  }
}
</style>
