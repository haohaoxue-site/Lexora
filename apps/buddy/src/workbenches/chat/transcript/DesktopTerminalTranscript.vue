<script setup lang="ts">
import type { DesktopTerminalShell } from './useDesktopTerminalTranscript'
import { computed, useTemplateRef } from 'vue'
import {
  projectDesktopTerminalTranscript,
  useDesktopTerminalTranscript,
} from './useDesktopTerminalTranscript'

const props = defineProps<{
  command: string
  output: string | null
  shell: DesktopTerminalShell
}>()

const TERMINAL_LINE_HEIGHT = 20
const TERMINAL_MAX_VISIBLE_LINES = 12
const TERMINAL_VERTICAL_PADDING = 16
const TERMINAL_MAX_CONTENT_HEIGHT = TERMINAL_LINE_HEIGHT * TERMINAL_MAX_VISIBLE_LINES

const container = useTemplateRef<HTMLDivElement>('container')
const transcript = computed(() => projectDesktopTerminalTranscript({
  command: props.command,
  output: props.output,
  shell: props.shell,
}))
const { contentHeight, failed, loading } = useDesktopTerminalTranscript({ container, transcript })
const viewportContentHeight = computed(() => Math.min(
  Math.ceil(contentHeight.value ?? transcript.value.lineCount * TERMINAL_LINE_HEIGHT),
  TERMINAL_MAX_CONTENT_HEIGHT,
))
const height = computed(() => `${viewportContentHeight.value + TERMINAL_VERTICAL_PADDING}px`)
const scrollable = computed(() => (
  contentHeight.value !== null
  && contentHeight.value > TERMINAL_MAX_CONTENT_HEIGHT + 0.5
))
</script>

<template>
  <section
    class="desktop-terminal-transcript"
    :class="{ 'is-scrollable': scrollable }"
    :data-language="transcript.language"
    :data-scrollable="scrollable"
    :style="{ height }"
  >
    <div
      ref="container"
      class="desktop-terminal-transcript__editor"
      :class="{ 'is-loading': loading || failed }"
    />
    <pre
      v-if="loading || failed"
      class="desktop-terminal-transcript__fallback"
    >{{ transcript.text }}</pre>
  </section>
</template>

<style scoped lang="scss">
.desktop-terminal-transcript {
  --buddy-terminal-background: #eff1f5;
  --buddy-terminal-foreground: #4c4f69;
  --buddy-terminal-muted: #7c7f93;
  --buddy-terminal-selection: rgb(30 102 245 / 22%);
  --buddy-terminal-scrollbar: #9ca0b0;
  --buddy-terminal-mauve: #8839ef;
  --buddy-terminal-blue: #1e66f5;
  --buddy-terminal-green: #40a02b;
  --buddy-terminal-yellow: #df8e1d;
  --buddy-terminal-peach: #fe640b;
  --buddy-terminal-maroon: #e64553;
  --buddy-terminal-sky: #04a5e5;
  --buddy-terminal-rosewater: #dc8a78;

  position: relative;
  box-sizing: border-box;
  min-width: 0;
  max-height: 16rem;
  overflow: hidden;
  background: var(--buddy-terminal-background);
  padding: 8px 10px;
}

:global(:root[data-buddy-theme='dark'] .desktop-terminal-transcript) {
  --buddy-terminal-background: #1e1e2e;
  --buddy-terminal-foreground: #cdd6f4;
  --buddy-terminal-muted: #9399b2;
  --buddy-terminal-selection: rgb(137 180 250 / 28%);
  --buddy-terminal-scrollbar: #6c7086;
  --buddy-terminal-mauve: #cba6f7;
  --buddy-terminal-blue: #89b4fa;
  --buddy-terminal-green: #a6e3a1;
  --buddy-terminal-yellow: #f9e2af;
  --buddy-terminal-peach: #fab387;
  --buddy-terminal-maroon: #eba0ac;
  --buddy-terminal-sky: #89dceb;
  --buddy-terminal-rosewater: #f5e0dc;
}

.desktop-terminal-transcript__editor {
  width: 100%;
  height: 100%;

  &.is-loading {
    opacity: 0;
  }

  :deep(.monaco-editor),
  :deep(.monaco-editor .margin),
  :deep(.monaco-editor-background) {
    background: transparent;
  }

  :deep(.monaco-editor .current-line),
  :deep(.monaco-editor .current-line-margin),
  :deep(.monaco-editor .bracket-match) {
    border: 0 !important;
    background: transparent !important;
  }

  :deep(.monaco-editor .cursor) {
    display: none !important;
  }

  :deep(.monaco-editor .native-edit-context) {
    outline: 0 !important;
    caret-color: transparent !important;
  }

  :deep(.monaco-editor .selected-text) {
    border: 0 !important;
    outline: 0 !important;
    background: var(--buddy-terminal-selection) !important;
    box-shadow: none !important;
  }

  :deep(.monaco-scrollable-element > .scrollbar) {
    background: transparent !important;
  }

  :deep(.monaco-scrollable-element > .scrollbar.vertical > .slider) {
    border-radius: 999px;
    background: var(--buddy-terminal-scrollbar) !important;
    opacity: 0.5;
    transition: background-color 120ms ease, opacity 120ms ease;
  }

  :deep(.monaco-scrollable-element > .scrollbar.vertical:hover > .slider),
  :deep(.monaco-scrollable-element > .scrollbar.vertical > .slider.active) {
    background: var(--buddy-terminal-scrollbar) !important;
    opacity: 0.84;
  }

  :deep(.desktop-terminal-transcript__command) {
    color: var(--buddy-terminal-foreground) !important;
  }

  :deep(.desktop-terminal-transcript__prompt) {
    color: var(--buddy-terminal-mauve) !important;
    font-weight: 700;
  }

  :deep(.desktop-terminal-transcript__output) {
    color: var(--buddy-terminal-foreground) !important;
  }

  :deep(.desktop-terminal-transcript__token-command) {
    color: var(--buddy-terminal-blue) !important;
    font-weight: 600;
  }

  :deep(.desktop-terminal-transcript__token-string) {
    color: var(--buddy-terminal-green) !important;
  }

  :deep(.desktop-terminal-transcript__token-keyword) {
    color: var(--buddy-terminal-mauve) !important;
  }

  :deep(.desktop-terminal-transcript__token-attribute) {
    color: var(--buddy-terminal-yellow) !important;
  }

  :deep(.desktop-terminal-transcript__token-number) {
    color: var(--buddy-terminal-peach) !important;
  }

  :deep(.desktop-terminal-transcript__token-variable) {
    color: var(--buddy-terminal-maroon) !important;
  }

  :deep(.desktop-terminal-transcript__token-operator) {
    color: var(--buddy-terminal-sky) !important;
  }

  :deep(.desktop-terminal-transcript__token-comment) {
    color: var(--buddy-terminal-muted) !important;
    font-style: italic;
  }

  :deep(.desktop-terminal-transcript__token-metatag) {
    color: var(--buddy-terminal-rosewater) !important;
  }
}

.desktop-terminal-transcript:not(.is-scrollable) {
  :deep(.monaco-scrollable-element > .scrollbar.vertical) {
    display: none !important;
  }
}

.desktop-terminal-transcript__fallback {
  position: absolute;
  inset: 8px 10px;
  margin: 0;
  overflow: auto;
  background: var(--buddy-terminal-background);
  color: var(--buddy-terminal-foreground);
  font-family: var(--buddy-font-mono);
  font-size: 12px;
  line-height: 20px;
  padding: 0;
  scrollbar-color: var(--buddy-terminal-scrollbar) transparent;
  scrollbar-width: thin;
  tab-size: 2;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
