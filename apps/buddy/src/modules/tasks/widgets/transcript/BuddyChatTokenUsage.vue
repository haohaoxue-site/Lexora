<script setup lang="ts">
import type { LocalRunTokenUsage } from '@buddy-shared/usage/runTokenUsage'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { summarizeRunTokenUsage } from '@buddy-shared/usage/runTokenUsage'
import { ArrowDown20Regular, ArrowUp20Regular, Database20Regular } from '@vicons/fluent'
import { NTooltip } from 'naive-ui'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  compact?: boolean
  language: BuddyLocale
  usage: LocalRunTokenUsage
}>()

const { t } = useBuddyI18n(() => props.language)
const summary = computed(() => summarizeRunTokenUsage(props.usage))
const compactNumber = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const exactNumber = computed(() => new Intl.NumberFormat(props.language))
const percentage = computed(() => new Intl.NumberFormat(props.language, { style: 'percent', maximumFractionDigits: 1 }))
const cacheRate = computed(() => summary.value.cacheHitRate === null ? '—' : percentage.value.format(summary.value.cacheHitRate))
const metrics = computed(() => [
  { key: 'input', label: t('desktop.chat.usage.input'), icon: ArrowDown20Regular, value: summary.value.inputTokens },
  { key: 'output', label: t('desktop.chat.usage.output'), icon: ArrowUp20Regular, value: summary.value.outputTokens },
  { key: 'cache', label: t('desktop.chat.usage.cache'), icon: Database20Regular, value: summary.value.cachedTokens },
])
</script>

<template>
  <NTooltip :delay="300">
    <template #trigger>
      <dl v-bind="$attrs" class="buddy-chat-token-usage" :class="{ 'is-compact': compact }" tabindex="0">
        <div v-for="metric in metrics" :key="metric.key" class="buddy-chat-token-usage__metric" :data-usage-metric="metric.key">
          <dt :aria-label="metric.label">
            <DesktopIcon :component="metric.icon" aria-hidden="true" />
          </dt>
          <dd>{{ compactNumber.format(metric.value) }}</dd>
        </div>
      </dl>
    </template>
    <div class="buddy-chat-token-usage__tooltip">
      <dl class="buddy-chat-token-usage__details">
        <div v-for="metric in metrics" :key="metric.key">
          <dt>{{ metric.label }}</dt>
          <dd>
            {{ exactNumber.format(metric.value) }}<template v-if="metric.key === 'cache'">
              / {{ cacheRate }}
            </template>
          </dd>
        </div>
      </dl>
    </div>
  </NTooltip>
</template>

<style scoped lang="scss">
.buddy-chat-token-usage {
  display: inline-flex;
  flex: none;
  min-width: 0;
  align-items: center;
  gap: 0.75rem;
  margin: 0;
  color: var(--buddy-text-muted);
  font-size: 0.68rem;
  font-variant-numeric: tabular-nums;
  line-height: 1;

  &:focus-visible {
    outline: 1px solid var(--buddy-focus-ring);
    outline-offset: 3px;
    border-radius: var(--buddy-radius-micro);
  }

  &.is-compact {
    gap: 6px;
    font-size: 10px;
  }
}

.buddy-chat-token-usage__metric {
  display: flex;
  align-items: center;
  gap: 0.25em;
  white-space: nowrap;

  dt {
    display: flex;
    align-items: center;
    font-size: 1.2em;
  }

  dd {
    margin: 0;
    color: var(--buddy-text-secondary);
  }
}

.buddy-chat-token-usage__tooltip {
  font-size: 0.75rem;
  line-height: 1.6;
}

.buddy-chat-token-usage__details {
  margin: 0;

  > div {
    display: flex;
    justify-content: space-between;
    gap: 1.5rem;
  }

  dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
}
</style>
