<script setup lang="ts">
import { NScrollbar } from 'naive-ui'

defineSlots<{
  actions?: () => unknown
  default: () => unknown
  description?: () => unknown
  title: () => unknown
}>()
</script>

<template>
  <section class="desktop-settings-page">
    <header class="desktop-settings-page__header">
      <div class="desktop-settings-page__header-copy">
        <h1><slot name="title" /></h1>
        <p v-if="$slots.description">
          <slot name="description" />
        </p>
      </div>
      <div v-if="$slots.actions" class="desktop-settings-page__header-actions">
        <slot name="actions" />
      </div>
    </header>

    <NScrollbar class="desktop-settings-page__scroll">
      <div class="desktop-settings-page__content">
        <slot />
      </div>
    </NScrollbar>
  </section>
</template>

<style scoped>
.desktop-settings-page {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  background: var(--buddy-bg-surface);
}

.desktop-settings-page__header {
  display: flex;
  height: var(--buddy-region-header-height);
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--buddy-border-light);
  padding: 0 1.1rem;
}

.desktop-settings-page__header-copy {
  display: grid;
  min-width: 0;
  gap: 0.08rem;
}

.desktop-settings-page__header h1,
.desktop-settings-page__header p {
  overflow: hidden;
  margin: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-settings-page__header h1 {
  font-size: 0.88rem;
  font-weight: 660;
}

.desktop-settings-page__header p {
  color: var(--buddy-text-secondary);
  font-size: 0.68rem;
}

.desktop-settings-page__header-actions {
  display: flex;
  flex: none;
  align-items: center;
}

.desktop-settings-page__scroll {
  min-height: 0;
  flex: 1;
}

.desktop-settings-page__content {
  display: grid;
  width: min(100%, 64rem);
  gap: 1.8rem;
  margin: 0 auto;
  padding: clamp(1.4rem, 3vw, 2.8rem) clamp(1.4rem, 3vw, 2.8rem) 3rem;
}
</style>
