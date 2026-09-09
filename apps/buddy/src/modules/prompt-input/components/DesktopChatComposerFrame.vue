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
  --desktop-chat-composer-editor-padding-top: 0.35rem;
  --desktop-chat-composer-editor-padding-bottom: 0.35rem;

  width: 100%;
  min-width: 0;
  margin: 0 auto;
  container: desktop-chat-composer / inline-size;
}

.desktop-chat-composer {
  position: relative;
  width: 100%;
  min-width: 0;
  border: 1px solid var(--buddy-border-strong);
  border-radius: 6px;
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
  min-height: calc(2lh + var(--desktop-chat-composer-editor-padding-top) + var(--desktop-chat-composer-editor-padding-bottom));
  max-height: calc(8lh + var(--desktop-chat-composer-editor-padding-top) + var(--desktop-chat-composer-editor-padding-bottom));
  font-size: 0.9rem;
  line-height: 1.58;
}

:deep(.desktop-chat-composer__prosemirror) {
  min-height: calc(2lh + var(--desktop-chat-composer-editor-padding-top) + var(--desktop-chat-composer-editor-padding-bottom));
  border: 0;
  outline: 0;
  color: var(--buddy-text-strong);
  font-size: 0.9rem;
  line-height: 1.58;
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
  margin-inline: 0.2rem;
  border: 1px solid var(--buddy-accent-border);
  border-radius: 0.38rem;
  background: var(--buddy-accent-surface);
  color: var(--buddy-accent-on-surface);
  font-size: 0.78rem;
  font-weight: 650;
  line-height: 1.45;
  padding: 0.05rem 0.35rem;
}

:deep([data-type='chat-resource-reference']) {
  gap: 0.28rem;
  border-color: color-mix(in srgb, var(--buddy-border-strong) 88%, var(--buddy-surface-raised));
  border-radius: 0.28rem;
  background: var(--buddy-surface-raised);
  box-shadow: none;
  color: var(--buddy-text-secondary);
  font-weight: 600;
  vertical-align: calc(-0.05rem - 1px);
  cursor: pointer;

  &:hover {
    border-color: var(--buddy-accent-border);
    background: color-mix(in srgb, var(--buddy-accent-surface) 28%, var(--buddy-surface-raised));
  }
}

:deep([data-type='chat-resource-reference'].ProseMirror-selectednode) {
  border-color: var(--buddy-focus-ring);
  background: color-mix(in srgb, var(--buddy-accent-surface) 32%, var(--buddy-surface-raised));
  box-shadow: none;
  color: var(--buddy-accent-on-surface);
}

:deep(.chat-resource-reference__icon) {
  display: block;
  width: 0.9rem;
  height: 0.9rem;
  flex: none;
  object-fit: contain;
}

:deep(.chat-resource-reference__label) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-chat-composer__toolbar,
.desktop-chat-composer__actions,
.desktop-chat-composer__leading-actions {
  display: flex;
  min-width: 0;
  align-items: center;
}

.desktop-chat-composer__toolbar {
  min-height: var(--buddy-composer-control-height);
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
