<script setup lang="ts">
import type { ChatAgentCompactionNode } from './chatStreamingMessage'
import type { BuddyI18nKey, BuddyLocale } from '@/i18n/buddyI18n'
import { ArrowSync20Regular } from '@vicons/fluent'
import { NIcon } from 'naive-ui'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import BuddyChatShimmerText from './BuddyChatShimmerText.vue'

const props = defineProps<{
  language: BuddyLocale
  node: ChatAgentCompactionNode
}>()

const { t } = useBuddyI18n(() => props.language)
const statusKeys: Record<ChatAgentCompactionNode['status'], BuddyI18nKey> = {
  cancelled: 'run.status.cancelled',
  completed: 'run.status.completed',
  failed: 'run.status.failed',
  interrupted: 'desktop.chat.processToolInterrupted',
  running: 'run.status.running',
}
const status = computed(() => t(statusKeys[props.node.status]))
const result = computed(() => {
  if (
    props.node.status !== 'completed'
    || props.node.tokensBefore === null
    || props.node.estimatedTokensAfter === null
  ) {
    return null
  }
  return t('desktop.chat.compactionTokens', {
    after: formatTokens(props.node.estimatedTokensAfter),
    before: formatTokens(props.node.tokensBefore),
  })
})
const summary = computed(() => [status.value, result.value].filter(Boolean).join(' · '))

function formatTokens(value: number): string {
  return new Intl.NumberFormat(props.language).format(value)
}
</script>

<template>
  <div class="buddy-chat-compaction" :class="`is-${node.status}`" role="status">
    <NIcon :component="ArrowSync20Regular" class="buddy-chat-compaction__icon" />
    <BuddyChatShimmerText
      class="buddy-chat-compaction__title"
      :mode="node.status === 'running' ? 'continuous' : 'static'"
    >
      {{ t('desktop.chat.compactionEvent') }}
    </BuddyChatShimmerText>
    <span class="buddy-chat-compaction__summary">{{ summary }}</span>
  </div>
</template>

<style scoped lang="scss">
.buddy-chat-compaction {
  --buddy-shimmer-duration: 1.35s;
  --buddy-shimmer-highlight: var(--buddy-text-strong);
  display: flex;
  min-width: 0;
  min-height: 24px;
  align-items: center;
  color: var(--buddy-chat-tool-title-color);
}

.buddy-chat-compaction__icon {
  width: var(--buddy-chat-node-icon-size);
  height: var(--buddy-chat-node-icon-size);
  flex: 0 0 auto;
  margin-right: 6px;
}

.buddy-chat-compaction__title {
  --buddy-shimmer-base: var(--buddy-chat-tool-title-color);

  flex: 0 0 auto;
  font-size: 14px;
  font-weight: 550;
  line-height: 24px;
  white-space: nowrap;
}

.buddy-chat-compaction__summary {
  min-width: 0;
  overflow: hidden;
  flex: 0 1 auto;
  color: var(--buddy-chat-tool-body-color);
  font-size: 14px;
  line-height: 24px;
  margin-left: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
