<script setup lang="ts">
import { NScrollbar } from 'naive-ui'

withDefaults(defineProps<{
  borderRadius?: string
  expanded?: boolean
}>(), {
  expanded: false,
})
</script>

<template>
  <div class="desktop-chat-composer-frame" :class="{ 'is-expanded': expanded }">
    <slot name="attachments" />

    <div class="desktop-chat-composer" :style="{ borderRadius }">
      <slot name="overlay" />

      <div class="desktop-chat-composer__editor-wrap">
        <NScrollbar class="desktop-chat-composer__editor-scrollbar">
          <slot name="editor" />
        </NScrollbar>
      </div>

      <div class="desktop-chat-composer__toolbar">
        <div class="desktop-chat-composer__leading-actions">
          <slot name="leading" />
        </div>
        <div class="desktop-chat-composer__actions">
          <slot name="actions" />
        </div>
      </div>
    </div>

    <slot name="footer" />
  </div>
</template>

<style scoped lang="scss">
.desktop-chat-composer-frame {
  --desktop-chat-composer-editor-padding-top: 0.1rem;
  --desktop-chat-composer-editor-padding-bottom: 0.6rem;

  width: 100%;
  margin: 0 auto;
}

.desktop-chat-composer {
  position: relative;
  border: 1px solid var(--buddy-border-strong);
  border-radius: 0.75rem;
  background: var(--buddy-surface-base);
  padding: 0.65rem;
  transition: border-color 120ms ease;

  &:focus-within {
    border-color: var(--buddy-focus-ring);
  }
}

.desktop-chat-composer__editor-wrap {
  position: relative;
}

:deep(.desktop-chat-composer__editor-scrollbar) {
  min-height: calc(3lh + var(--desktop-chat-composer-editor-padding-top) + var(--desktop-chat-composer-editor-padding-bottom));
  max-height: calc(8lh + var(--desktop-chat-composer-editor-padding-top) + var(--desktop-chat-composer-editor-padding-bottom));
  font-size: 0.9rem;
  line-height: 1.58;
}

:deep(.desktop-chat-composer__prosemirror) {
  min-height: calc(3lh + var(--desktop-chat-composer-editor-padding-top) + var(--desktop-chat-composer-editor-padding-bottom));
  border: 0;
  outline: 0;
  color: var(--buddy-text-strong);
  font-size: 0.9rem;
  line-height: 1.58;
  padding: var(--desktop-chat-composer-editor-padding-top) 0.75rem var(--desktop-chat-composer-editor-padding-bottom) 0.2rem;
  white-space: pre-wrap;
  word-break: break-word;

  p {
    margin: 0;
  }

  p.is-editor-empty:first-child::before {
    content: attr(data-placeholder);
    float: left;
    height: 0;
    color: var(--buddy-text-muted);
    pointer-events: none;
  }
}

.is-expanded :deep(.desktop-chat-composer__editor-scrollbar),
.is-expanded :deep(.desktop-chat-composer__prosemirror) {
  min-height: 9rem;
}

.is-expanded :deep(.desktop-chat-composer__editor-scrollbar) {
  max-height: 18rem;
}

:deep(.chat-prompt-token-node) {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  border: 1px solid var(--buddy-accent-border);
  border-radius: 0.38rem;
  background: var(--buddy-accent-surface);
  color: var(--buddy-accent-on-surface);
  font-size: 0.78rem;
  font-weight: 650;
  line-height: 1.45;
  padding: 0.05rem 0.35rem;
}

.desktop-chat-composer__toolbar,
.desktop-chat-composer__actions,
.desktop-chat-composer__leading-actions {
  display: flex;
  min-width: 0;
  align-items: center;
}

.desktop-chat-composer__toolbar {
  justify-content: space-between;
  gap: 0.55rem;
}

.desktop-chat-composer__actions {
  justify-content: flex-end;
  gap: 0.35rem;
}

.desktop-chat-composer__leading-actions {
  gap: 0.35rem;
}
</style>
