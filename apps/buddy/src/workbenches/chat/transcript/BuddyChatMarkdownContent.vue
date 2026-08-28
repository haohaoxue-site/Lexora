<script setup lang="ts">
import { usePreferredReducedMotion } from '@vueuse/core'
import MarkdownRender from 'markstream-vue'
import { computed } from 'vue'
import 'markstream-vue/index.css'

const props = withDefaults(defineProps<{
  content: string
  final?: boolean
}>(), {
  final: true,
})

const reducedMotion = usePreferredReducedMotion()
const animateStreaming = computed(() => (
  !props.final && reducedMotion.value !== 'reduce'
))
</script>

<template>
  <MarkdownRender
    class="buddy-chat-markdown"
    :batch-rendering="animateStreaming"
    :content="content"
    :fade="false"
    :final="final"
    html-policy="escape"
    :max-live-nodes="animateStreaming ? 0 : undefined"
    mode="chat"
    :render-batch-budget-ms="4"
    :render-batch-delay="8"
    :render-batch-size="16"
    :render-code-blocks-as-pre="true"
    :smooth-streaming="animateStreaming ? 'auto' : false"
    :typewriter="animateStreaming ? 'precise' : false"
  />
</template>

<style scoped lang="scss">
.buddy-chat-markdown {
  width: 100%;
  min-width: 0;
  color: inherit;
  --ms-font-sans: var(--buddy-font-ui);
  --ms-font-mono: var(--buddy-font-mono);
  --ms-text-body: var(--buddy-chat-final-font-size);
  --ms-leading-body: var(--buddy-chat-final-line-height);
  --ms-text-h1: 22px;
  --ms-text-h2: 19px;
  --ms-text-h3: 16px;
  --ms-text-h4: var(--buddy-chat-final-heading-font-size);
  --ms-text-h5: var(--buddy-chat-final-heading-font-size);
  --ms-text-h6: var(--buddy-chat-final-heading-font-size);
  --ms-leading-h1: 1.3;
  --ms-leading-h2: 1.3;
  --ms-leading-h3: 1.35;
  --ms-weight-h1: 600;
  --ms-flow-paragraph-y: 0.375rem;
  --ms-flow-list-y: 0.375rem;
  --ms-flow-list-item-y: 0.1875rem;
  --ms-flow-list-indent: 1.375rem;
  --ms-flow-list-indent-mobile: 1.125rem;
  --ms-flow-table-y: 0.625rem;
  --ms-flow-table-cell: 0.375rem 0.5rem;
  --ms-flow-blockquote-y: 0.5rem;
  --ms-flow-blockquote-indent: 0.75rem;
  --ms-flow-admonition-y: 0.625rem;
  --ms-flow-footnote-y: 0.375rem;
  --ms-flow-hr-y: 1rem;
  --ms-flow-diagram-y: 0.625rem;
  --ms-flow-codeblock-y: 0.5rem;
  --ms-flow-definition-term-mt: 0.5rem;
  --ms-flow-definition-desc-ml: 1rem;
  --ms-flow-definition-desc-mb: 0.375rem;
  --ms-flow-heading-1-mt: 1.125rem;
  --ms-flow-heading-1-mb: 0.5rem;
  --ms-flow-heading-2-mt: 1rem;
  --ms-flow-heading-2-mb: 0.375rem;
  --ms-flow-heading-3-mt: 0.875rem;
  --ms-flow-heading-3-mb: 0.375rem;
  --ms-flow-heading-4-mt: 0.75rem;
  --ms-flow-heading-4-mb: 0.25rem;
  --ms-flow-heading-5-mt: 0.75rem;
  --ms-flow-heading-5-mb: 0.25rem;
  --ms-flow-heading-6-mt: 0.75rem;
  --ms-flow-heading-6-mb: 0.25rem;
  --ms-inset-panel-body: 0.875rem;
  --link-color: var(--buddy-accent-text);
  --code-bg: var(--buddy-surface-raised);
  --code-fg: var(--buddy-chat-code-color);
  --code-border: var(--buddy-border-subtle);
  --inline-code-bg: var(--buddy-surface-raised);
  --inline-code-fg: var(--buddy-chat-code-color);
  --inline-code-border: var(--buddy-border-subtle);
  --blockquote-border: var(--buddy-border-subtle);
  --table-border: var(--buddy-border-subtle);
  --table-header-bg: var(--buddy-surface-subtle);
  --list-marker: var(--buddy-text-muted);
  --list-counter-marker: var(--buddy-text-secondary);
  --hr-border: var(--buddy-border-subtle);
  --footnote-border: var(--buddy-border-subtle);
  --admonition-bg: var(--buddy-surface-subtle);
  --admonition-border: var(--buddy-border-subtle);
  --admonition-fg: var(--buddy-text-primary);
  --admonition-muted: var(--buddy-text-secondary);
  --diagram-bg: var(--buddy-surface-subtle);
  --diagram-border: var(--buddy-border-subtle);
  --diagram-header-bg: var(--buddy-surface-raised);
  --loading-spinner: var(--buddy-text-secondary);
  --loading-shimmer: var(--buddy-surface-subtle);
  --image-placeholder-bg: var(--buddy-surface-subtle);
}

:global(.buddy-chat-markdown > .node-slot:first-of-type .node-content > :first-child) {
  margin-top: 0;
}

:global(.buddy-chat-markdown > .node-slot:last-of-type .node-content > :last-child) {
  margin-bottom: 0;
}
</style>
