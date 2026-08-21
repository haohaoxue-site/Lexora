<script setup lang="ts">
defineSlots<{
  context?: () => unknown
  default: () => unknown
  sidebar: () => unknown
}>()
</script>

<template>
  <section class="desktop-workbench-layout">
    <slot name="sidebar" />
    <main class="desktop-workbench-layout__workspace">
      <slot />
    </main>
    <aside v-if="$slots.context" class="desktop-workbench-layout__context">
      <slot name="context" />
    </aside>
  </section>
</template>

<style scoped>
.desktop-workbench-layout {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1;
  background: var(--buddy-bg-surface);
}

.desktop-workbench-layout__workspace {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.desktop-workbench-layout__context {
  display: flex;
  min-width: 0;
  min-height: 0;
  border-left: 1px solid var(--buddy-border-light);
}
</style>
