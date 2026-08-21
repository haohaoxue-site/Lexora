<script setup lang="ts">
import type { BuddyToolPresentation } from '@buddy-shared/runEventPresentation'
import type { ChatAgentToolNode } from './chatStreamingMessage'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

interface ToolDetailSection {
  content: string
  empty: boolean
  key: 'changes' | 'command' | 'output'
  label: string
  truncated: boolean
}

const props = defineProps<{
  language: BuddyLocale
  presentation: BuddyToolPresentation
  status: ChatAgentToolNode['status']
}>()

const { t } = useBuddyI18n(() => props.language)
const terminal = computed(() => props.presentation.card === 'terminal'
  ? props.presentation
  : null)
const terminalLabel = computed(() => terminal.value?.cwd && terminal.value.cwd !== '.'
  ? `bash · ${terminal.value.cwd}`
  : 'bash')
const terminalStatus = computed(() => {
  if (!terminal.value)
    return ''
  switch (props.status) {
    case 'awaiting_approval':
      return t('desktop.chat.processAwaitingApproval')
    case 'completed':
      return t('desktop.chat.processToolSucceeded')
    case 'failed':
      return terminal.value.exitCode === null
        ? t('desktop.chat.processToolFailed')
        : t('desktop.chat.processToolExitCode', { code: terminal.value.exitCode })
    case 'interrupted':
      return t('desktop.chat.processToolInterrupted')
    case 'running':
      return t('desktop.chat.processToolRunning')
  }
  return assertNever(props.status)
})
const terminalNotice = computed(() => {
  if (!terminal.value || terminal.value.output)
    return null
  if (props.status === 'completed')
    return t('desktop.chat.processToolNoOutput')
  if (props.status === 'interrupted')
    return t('desktop.chat.processToolIncompleteOutput')
  return null
})
const sections = computed<ToolDetailSection[]>(() => {
  const presentation = props.presentation
  const values: ToolDetailSection[] = []
  if (presentation.card === 'terminal')
    return values
  if (presentation.card === 'diff' && presentation.diff) {
    values.push(section(
      'changes',
      t('desktop.chat.processToolChanges'),
      presentation.diff,
    ))
  }
  if (presentation.card === 'pet')
    return values
  if (presentation.output !== null) {
    values.push(section(
      'output',
      t('desktop.chat.processToolOutput'),
      presentation.output,
      presentation.truncated,
    ))
  }
  return values
})

function section(
  key: ToolDetailSection['key'],
  label: string,
  content: string,
  truncated = false,
): ToolDetailSection {
  return { content, empty: false, key, label, truncated }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected terminal status: ${value}`)
}
</script>

<template>
  <div class="buddy-chat-tool-details" :class="`is-${status}`">
    <section v-if="terminal" class="buddy-chat-terminal-card">
      <header class="buddy-chat-terminal-card__banner">
        <span>{{ terminalLabel }}</span>
        <small>{{ terminalStatus }}</small>
      </header>
      <div class="buddy-chat-terminal-card__section is-command">
        <pre><code>{{ terminal.command }}</code></pre>
      </div>
      <div v-if="terminal.output || terminalNotice" class="buddy-chat-terminal-card__divider" />
      <div v-if="terminal.output" class="buddy-chat-terminal-card__section is-output">
        <span>{{ t('desktop.chat.processToolOutput') }}</span>
        <pre><code>{{ terminal.output }}</code></pre>
      </div>
      <p v-else-if="terminalNotice" class="buddy-chat-terminal-card__notice">
        {{ terminalNotice }}
      </p>
      <small v-if="terminal.truncated" class="buddy-chat-terminal-card__truncated">
        {{ t('desktop.chat.processToolTruncated') }}
      </small>
    </section>
    <section
      v-for="item in sections"
      :key="item.key"
      class="buddy-chat-tool-details__section"
      :class="[`is-${item.key}`, { 'is-empty': item.empty }]"
    >
      <header class="buddy-chat-tool-details__header">
        <span>{{ item.label }}</span>
        <small v-if="item.truncated">{{ t('desktop.chat.processToolTruncated') }}</small>
      </header>
      <pre><code>{{ item.content }}</code></pre>
    </section>
  </div>
</template>

<style scoped lang="scss">
.buddy-chat-tool-details {
  display: grid;
  gap: var(--buddy-chat-gap-block);
  margin-top: var(--buddy-chat-gap-tight);
}

.buddy-chat-terminal-card {
  min-width: 0;
  overflow: hidden;
  border: 0;
  border-left: 2px solid var(--buddy-border-light);
  border-radius: 0 var(--buddy-radius-micro) var(--buddy-radius-micro) 0;
  background: color-mix(in srgb, var(--buddy-text-primary) 2%, transparent);
}

.buddy-chat-terminal-card__banner {
  display: flex;
  min-height: 1.625rem;
  align-items: center;
  justify-content: space-between;
  color: var(--buddy-chat-meta-color);
  font-size: var(--buddy-chat-caption-font-size);
  padding: 0.15rem 0.625rem 0.1rem;

  small {
    color: var(--buddy-accent-primary);
    font-size: inherit;
  }
}

.buddy-chat-terminal-card__section {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: start;
  gap: 0.875rem;
  color: var(--buddy-chat-meta-color);
  font-size: var(--buddy-chat-caption-font-size);
  padding: 0.375rem 0.625rem 0.5rem;

  > span {
    position: sticky;
    top: 0;
  }

  pre {
    margin: 0;
    color: var(--buddy-chat-code-color);
    font-family: var(--buddy-font-mono);
    font-variant-ligatures: none;
    font-size: var(--buddy-chat-code-font-size);
    line-height: var(--buddy-chat-code-line-height);
    tab-size: 2;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
}

.buddy-chat-terminal-card__section.is-command {
  display: block;
  overflow: visible;

  pre {
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    color: var(--buddy-chat-tool-body-color);
    white-space: pre;
    overflow-wrap: normal;
  }
}

.buddy-chat-terminal-card__section.is-output {
  display: block;
  max-height: 12rem;
  overflow-y: auto;
  background: color-mix(in srgb, var(--buddy-text-primary) 2%, transparent);
  padding: 0.45rem 0.625rem 0.55rem;

  > span {
    position: static;
    display: block;
    margin-bottom: 0.25rem;
  }
}

.buddy-chat-terminal-card__divider {
  height: 1px;
  margin: 0 0.625rem;
  background: var(--buddy-border-light);
}

.buddy-chat-terminal-card__notice {
  margin: 0;
  color: var(--buddy-text-placeholder);
  font-size: var(--buddy-chat-caption-font-size);
  line-height: var(--buddy-chat-code-line-height);
  padding: 0.45rem 0.625rem 0.55rem;
}

.buddy-chat-terminal-card__truncated {
  display: block;
  color: var(--buddy-text-placeholder);
  padding: 0 0.75rem 0.65rem;
}

.buddy-chat-tool-details.is-failed .buddy-chat-terminal-card {
  border-left-color: color-mix(in srgb, var(--buddy-chat-danger-color) 55%, var(--buddy-border-light));
}

.buddy-chat-tool-details.is-failed .buddy-chat-terminal-card__banner small {
  color: var(--buddy-chat-danger-color);
}

.buddy-chat-tool-details.is-interrupted .buddy-chat-terminal-card {
  border-left-color: color-mix(in srgb, var(--buddy-accent-warning) 55%, var(--buddy-border-light));
}

.buddy-chat-tool-details.is-interrupted .buddy-chat-terminal-card__banner small,
.buddy-chat-tool-details.is-awaiting_approval .buddy-chat-terminal-card__banner small {
  color: var(--buddy-accent-warning);
}

.buddy-chat-tool-details__section {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--buddy-border-light);
  border-radius: var(--buddy-radius-micro);
  background: color-mix(in srgb, var(--buddy-bg-surface-raised) 72%, transparent);

  &.is-output {
    background: color-mix(in srgb, var(--buddy-text-primary) 3%, transparent);
  }

  &.is-empty pre {
    color: var(--buddy-text-placeholder);
    font-family: inherit;
  }
}

.buddy-chat-tool-details.is-failed .buddy-chat-tool-details__section.is-output {
  border-color: color-mix(in srgb, var(--buddy-chat-danger-color) 34%, var(--buddy-border-light));
}

.buddy-chat-tool-details__header {
  display: flex;
  min-height: 1.7rem;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--buddy-border-light);
  color: var(--buddy-chat-meta-color);
  font-size: var(--buddy-chat-caption-font-size);
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 0.25rem 0.625rem;

  small {
    color: var(--buddy-text-placeholder);
    font-size: inherit;
    font-weight: 400;
  }
}

.buddy-chat-tool-details__section pre {
  max-height: 15rem;
  margin: 0;
  overflow: auto;
  color: var(--buddy-chat-code-color);
  font-family: var(--buddy-font-mono);
  font-size: var(--buddy-chat-code-font-size);
  line-height: var(--buddy-chat-code-line-height);
  padding: 0.625rem 0.75rem;
  tab-size: 2;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
