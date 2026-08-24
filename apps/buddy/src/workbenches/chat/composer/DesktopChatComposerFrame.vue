<script setup lang="ts">
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
      <div class="desktop-chat-composer__editor-wrap">
        <slot name="editor" />
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
  width: 100%;
  margin: 0 auto;
}

.desktop-chat-composer {
  position: relative;
  border: 1px solid var(--buddy-border-base);
  border-radius: 0.75rem;
  background: var(--buddy-bg-surface);
  padding: 0.65rem;
  transition: border-color 120ms ease;

  &:focus-within {
    border-color: color-mix(in srgb, var(--buddy-accent-primary) 58%, var(--buddy-border-base));
  }
}

.desktop-chat-composer__editor-wrap {
  position: relative;
}

:deep(.desktop-chat-composer__prosemirror) {
  min-height: 3.25rem;
  max-height: 12rem;
  overflow-y: auto;
  border: 0;
  outline: 0;
  color: var(--buddy-text-primary);
  font-size: 0.9rem;
  line-height: 1.58;
  padding: 0.1rem 0.2rem 0.6rem;
  white-space: pre-wrap;
  word-break: break-word;

  p {
    margin: 0;
  }

  p.is-editor-empty:first-child::before {
    content: attr(data-placeholder);
    float: left;
    height: 0;
    color: var(--buddy-text-placeholder);
    pointer-events: none;
  }
}

.is-expanded :deep(.desktop-chat-composer__prosemirror) {
  min-height: 9rem;
  max-height: 18rem;
}

:deep(.chat-prompt-token-node) {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  border: 1px solid color-mix(in srgb, var(--buddy-accent-primary) 30%, var(--buddy-border-light));
  border-radius: 0.38rem;
  background: color-mix(in srgb, var(--buddy-accent-primary) 10%, var(--buddy-bg-surface));
  color: var(--buddy-accent-primary);
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
