<script setup lang="ts">
import type { BuddyToolPresentation } from '@buddy-shared/runEventPresentation'
import type { ChatAgentToolNode } from './chatStreamingMessage'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import BuddyChatImageToolDetails from './BuddyChatImageToolDetails.vue'
import DesktopTerminalTranscript from './DesktopTerminalTranscript.vue'

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
  toolName: string
}>()

const { t } = useBuddyI18n(() => props.language)
const terminal = computed(() => props.presentation.card === 'terminal'
  ? props.presentation
  : null)
const image = computed(() => props.presentation.card === 'image'
  ? props.presentation
  : null)
const directoryAuthorization = computed(() => (
  props.presentation.card === 'directory-authorization'
    ? props.presentation
    : null
))
const directoryRelation = computed(() => {
  switch (directoryAuthorization.value?.relation) {
    case 'exact': return t('desktop.chat.processToolDirectoryRelationExact')
    case 'ancestor': return t('desktop.chat.processToolDirectoryRelationBroader')
    case 'descendant': return t('desktop.chat.processToolDirectoryRelationNarrower')
    case 'unrelated': return t('desktop.chat.processToolDirectoryRelationUnrelated')
    default: return null
  }
})
const terminalShell = computed(() => props.toolName === 'powershell' ? 'powershell' : 'bash')
const terminalOutput = computed(() => props.status === 'denied'
  ? null
  : terminal.value?.output ?? null)
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
  if (
    presentation.card === 'automation'
    || presentation.card === 'directory-authorization'
    || presentation.card === 'image'
    || presentation.card === 'pet'
  ) {
    return values
  }
  if (props.status !== 'denied' && presentation.output !== null) {
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
</script>

<template>
  <div class="buddy-chat-tool-details" :class="`is-${status}`">
    <BuddyChatImageToolDetails
      v-if="image"
      :language="language"
      :presentation="image"
    />
    <section
      v-if="directoryAuthorization"
      class="buddy-chat-tool-details__section buddy-chat-directory-authorization"
    >
      <dl>
        <div v-if="directoryAuthorization.requestedRoot">
          <dt>{{ t('desktop.chat.processToolDirectoryRequestedRoot') }}</dt>
          <dd><code>{{ directoryAuthorization.requestedRoot }}</code></dd>
        </div>
        <div v-if="directoryAuthorization.selectedRoot">
          <dt>{{ t('desktop.chat.processToolDirectorySelectedRoot') }}</dt>
          <dd><code>{{ directoryAuthorization.selectedRoot }}</code></dd>
        </div>
        <div v-if="directoryRelation">
          <dt>{{ t('desktop.chat.processToolDirectoryScopeRelation') }}</dt>
          <dd>{{ directoryRelation }}</dd>
        </div>
        <div v-if="directoryAuthorization.requestSatisfied !== null">
          <dt>{{ t('desktop.chat.processToolDirectoryRequestSatisfied') }}</dt>
          <dd>
            {{ t(directoryAuthorization.requestSatisfied
              ? 'desktop.approval.directory.satisfied'
              : 'desktop.approval.directory.unsatisfied') }}
          </dd>
        </div>
        <div v-if="directoryAuthorization.coveredDirectoryCount > 0">
          <dt>{{ t('desktop.chat.processToolDirectoryExpanded') }}</dt>
          <dd>
            {{ t('desktop.chat.processToolDirectoryCoveredCount', {
              count: directoryAuthorization.coveredDirectoryCount,
            }) }}
          </dd>
        </div>
      </dl>
    </section>
    <section v-if="terminal" class="buddy-chat-terminal-card">
      <DesktopTerminalTranscript
        :command="terminal.command"
        :output="terminalOutput"
        :shell="terminalShell"
      />
      <p v-if="terminalNotice" class="buddy-chat-terminal-card__notice">
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
  border-radius: var(--buddy-radius-micro);
  background: var(--buddy-surface-subtle);
}

.buddy-chat-terminal-card__notice {
  margin: 0;
  color: var(--buddy-text-muted);
  font-size: var(--buddy-chat-caption-font-size);
  line-height: var(--buddy-chat-code-line-height);
  padding: 0.45rem 0.625rem 0.55rem;
}

.buddy-chat-terminal-card__truncated {
  display: block;
  color: var(--buddy-text-muted);
  padding: 0 0.75rem 0.65rem;
}

.buddy-chat-tool-details.is-failed .buddy-chat-terminal-card {
  border-left-color: var(--buddy-status-danger-border);
}

.buddy-chat-tool-details.is-denied .buddy-chat-terminal-card,
.buddy-chat-tool-details.is-interrupted .buddy-chat-terminal-card {
  border-left-color: var(--buddy-status-warning-border);
}

.buddy-chat-tool-details__section {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: var(--buddy-radius-micro);
  background: var(--buddy-surface-raised);

  &.is-output {
    background: var(--buddy-surface-subtle);
  }

  &.is-empty pre {
    color: var(--buddy-text-muted);
    font-family: inherit;
  }
}

.buddy-chat-tool-details.is-failed .buddy-chat-tool-details__section.is-output {
  border-color: var(--buddy-status-danger-border);
}

.buddy-chat-tool-details__header {
  display: flex;
  min-height: 1.7rem;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--buddy-border-subtle);
  color: var(--buddy-chat-meta-color);
  font-size: var(--buddy-chat-caption-font-size);
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 0.25rem 0.625rem;

  small {
    color: var(--buddy-text-muted);
    font-size: inherit;
    font-weight: 400;
  }
}

.buddy-chat-directory-authorization {
  padding: 0.65rem 0.7rem;

  dl {
    display: grid;
    gap: 0.45rem;
    margin: 0;
  }

  dl > div {
    display: grid;
    grid-template-columns: minmax(6rem, 0.3fr) minmax(0, 1fr);
    gap: 0.6rem;
  }

  dt,
  dd {
    margin: 0;
    font-size: var(--buddy-chat-caption-font-size);
    line-height: var(--buddy-chat-caption-line-height);
  }

  dt {
    color: var(--buddy-text-secondary);
  }

  dd {
    min-width: 0;
    color: var(--buddy-text-primary);
    overflow-wrap: anywhere;
  }

  code {
    color: var(--buddy-chat-code-color);
    font-family: var(--buddy-font-mono);
    font-size: var(--buddy-chat-code-font-size);
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
