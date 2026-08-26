<script setup lang="ts">
import type { BuddyI18nKey, BuddyLocale } from '@/i18n/buddyI18n'
import type {
  ChatContextUsage,
  ChatContextUsageSegmentKind,
} from '@/workbenches/chat/composer/chatContextUsage'
import { Dismiss16Regular } from '@vicons/fluent'
import { NButton, NIcon, NPopover, NProgress } from 'naive-ui'
import { computed, shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  isRunning: boolean
  language: BuddyLocale
  usage: ChatContextUsage | null
}>()

const { t } = useBuddyI18n(() => props.language)
const isOpen = shallowRef(false)
const ringPercentage = computed(() => Math.min(100, Math.max(0, props.usage?.percent ?? 0)))
const ringColor = computed(() => {
  const percent = props.usage?.percent ?? 0
  if (percent >= 80)
    return 'var(--buddy-status-danger-text)'
  if (percent >= 60)
    return 'var(--buddy-status-warning-text)'
  return 'var(--buddy-accent-text)'
})
const percentLabel = computed(() => props.usage?.percent === null
  ? '—'
  : `${formatPercentage(props.usage?.percent ?? 0)}%`)
const usageSummary = computed(() => {
  const usage = props.usage
  if (!usage || usage.status === 'pending')
    return t('desktop.chat.contextUsagePending')
  return t('desktop.chat.contextUsageUsed', {
    total: formatTokens(usage.contextWindow),
    used: formatTokens(usage.totalTokens ?? 0),
  })
})
const segmentLabels: Record<ChatContextUsageSegmentKind, BuddyI18nKey> = {
  mcp: 'desktop.chat.contextUsageMcp',
  messages: 'desktop.chat.contextUsageMessages',
  skills: 'desktop.chat.contextUsageSkills',
  systemPrompt: 'desktop.chat.contextUsageSystemPrompt',
  tools: 'desktop.chat.contextUsageTools',
}
const segmentRows = computed(() => (props.usage?.segments ?? []).map(segment => ({
  ...segment,
  label: t(segmentLabels[segment.kind]),
  percent: props.usage ? segment.tokens / props.usage.contextWindow * 100 : 0,
})))
const trackSegments = computed(() => segmentRows.value.filter(segment => segment.tokens > 0))
const trackUsageStyle = computed(() => ({
  minWidth: `${trackSegments.value.length}px`,
  width: `${ringPercentage.value}%`,
}))

function updateVisibility(value: boolean) {
  isOpen.value = value
}

function formatPercentage(value: number): string {
  return new Intl.NumberFormat(props.language, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value)
}

function formatTokens(value: number): string {
  if (value < 1000)
    return new Intl.NumberFormat(props.language).format(value)
  return `${new Intl.NumberFormat(props.language, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value / 1000)}K`
}
</script>

<template>
  <NPopover
    v-if="usage"
    class="buddy-raw-popover"
    :show="isOpen"
    trigger="click"
    placement="top-end"
    raw
    to=".buddy-app"
    :show-arrow="false"
    @update:show="updateVisibility"
  >
    <template #trigger>
      <button
        class="desktop-context-usage__trigger"
        type="button"
        :aria-label="t('desktop.chat.contextUsageOpen')"
        aria-haspopup="dialog"
        :aria-expanded="isOpen"
      >
        <NProgress
          class="desktop-context-usage__ring"
          type="circle"
          :percentage="ringPercentage"
          :processing="isRunning || usage.status === 'pending'"
          :show-indicator="false"
          :stroke-width="12"
          :offset-degree="180"
          :color="ringColor"
          rail-color="var(--buddy-border-subtle)"
        />
      </button>
    </template>

    <section class="desktop-context-usage__panel">
      <header class="desktop-context-usage__header">
        <div>
          <strong>{{ t('desktop.chat.contextUsageTitle') }}</strong>
          <small>{{ t('desktop.chat.contextUsageDescription', { model: usage.modelName }) }}</small>
        </div>
        <NButton
          class="buddy-icon-button"
          quaternary
          size="small"
          :aria-label="t('common.close')"
          @click="isOpen = false"
        >
          <template #icon>
            <NIcon :component="Dismiss16Regular" />
          </template>
        </NButton>
      </header>

      <div class="desktop-context-usage__summary">
        <strong>{{ percentLabel }}</strong>
        <span>{{ usageSummary }}</span>
      </div>

      <div v-if="usage.status === 'ready'" class="desktop-context-usage__track">
        <div class="desktop-context-usage__track-used" :style="trackUsageStyle">
          <span
            v-for="segment in trackSegments"
            :key="segment.kind"
            :class="`is-${segment.kind}`"
            :style="{ flexGrow: segment.tokens }"
          />
        </div>
      </div>

      <dl v-if="usage.status === 'ready'" class="desktop-context-usage__breakdown">
        <div v-for="segment in segmentRows" :key="segment.kind">
          <dt>
            <span :class="`is-${segment.kind}`" />
            {{ segment.label }}
          </dt>
          <dd>
            {{ formatTokens(segment.tokens) }} · {{ formatPercentage(segment.percent) }}%
          </dd>
        </div>
      </dl>
    </section>
  </NPopover>
</template>

<style scoped lang="scss">
.desktop-context-usage__trigger {
  display: grid;
  width: var(--buddy-composer-control-height);
  height: var(--buddy-composer-control-height);
  flex: none;
  place-items: center;
  border: 0;
  border-radius: var(--buddy-composer-control-radius);
  background: transparent;
  cursor: pointer;
  padding: 0;
  transition:
    background-color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing),
    color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing);

  &:hover,
  &:focus-visible {
    background: var(--buddy-accent-surface-subtle);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: -2px;
  }

  &[aria-expanded='true'] {
    background: var(--buddy-accent-surface);
  }
}

.desktop-context-usage__ring {
  width: 1.125rem;
  height: 1.125rem;

  :deep(.n-progress-graph-circle svg) {
    display: block;
  }
}

.desktop-context-usage__panel {
  width: min(18rem, calc(100vw - 2rem));
  overflow: hidden;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 0.8rem;
  background: var(--buddy-surface-raised);
  background-clip: padding-box;
  box-shadow: var(--buddy-shadow-overlay);
  color: var(--buddy-text-strong);
  isolation: isolate;
  padding: 1rem;
}

.desktop-context-usage__header,
.desktop-context-usage__summary,
.desktop-context-usage__breakdown > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.desktop-context-usage__header {
  gap: 1rem;

  > div {
    display: grid;
    min-width: 0;
    gap: 0.15rem;
  }

  strong {
    font-size: 0.9rem;
    font-weight: 650;
  }

  small {
    overflow: hidden;
    color: var(--buddy-text-muted);
    font-size: 0.7rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.desktop-context-usage__summary {
  justify-content: flex-start;
  gap: 0.55rem;
  margin-top: 1rem;

  strong {
    font-size: 1.45rem;
    font-weight: 720;
    letter-spacing: -0.035em;
    line-height: 1;
  }

  span {
    color: var(--buddy-text-secondary);
    font-size: 0.74rem;
  }
}

.desktop-context-usage__track {
  height: 0.42rem;
  margin-top: 0.85rem;
  overflow: hidden;
  border-radius: 999px;
  background: var(--buddy-surface-subtle);
}

.desktop-context-usage__track-used {
  display: flex;
  max-width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: inherit;

  > span {
    min-width: 1px;
    flex-basis: 0;
  }
}

.desktop-context-usage__breakdown {
  display: grid;
  gap: 0.7rem;
  margin: 1rem 0 0;

  > div {
    gap: 1rem;
  }

  dt {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 0.55rem;
    color: var(--buddy-text-primary);
    font-size: 0.8rem;

    > span {
      width: 0.58rem;
      height: 0.58rem;
      flex: none;
      border-radius: 50%;
    }
  }

  dd {
    flex: none;
    margin: 0;
    color: var(--buddy-text-secondary);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
  }
}

.is-systemPrompt {
  background: var(--buddy-accent-solid);
}

.is-tools {
  background: var(--buddy-brand-gold);
}

.is-skills {
  background: var(--buddy-data-violet);
}

.is-mcp {
  background: var(--buddy-data-cyan);
}

.is-messages {
  background: var(--buddy-data-blue);
}
</style>
