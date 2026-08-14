<script setup lang="ts">
import type { ChatAgentReasoningGroup } from './chatStreamingMessage'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { ChevronRight20Regular, Lightbulb20Regular } from '@vicons/fluent'
import { NIcon } from 'naive-ui'
import { shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import BuddyChatReasoningRow from './BuddyChatReasoningRow.vue'

const props = defineProps<{
  group: ChatAgentReasoningGroup
  language: BuddyLocale
}>()

const { t } = useBuddyI18n(() => props.language)
const isOpen = shallowRef(true)
</script>

<template>
  <section class="buddy-chat-reasoning-group">
    <button
      :aria-expanded="isOpen"
      class="buddy-chat-reasoning-group__header"
      type="button"
      @click="isOpen = !isOpen"
    >
      <NIcon :component="Lightbulb20Regular" class="buddy-chat-reasoning-group__icon" />
      <span class="buddy-chat-reasoning-group__title">{{ t('desktop.chat.processReasoning') }}</span>
      <NIcon
        :component="ChevronRight20Regular"
        class="buddy-chat-reasoning-group__chevron"
        :class="{ 'is-open': isOpen }"
      />
    </button>
    <div v-show="isOpen" class="buddy-chat-reasoning-group__content">
      <BuddyChatReasoningRow
        v-for="entry in group.entries"
        :key="entry.id"
        :entry="entry"
        :language="language"
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
.buddy-chat-reasoning-group {
  display: grid;
  min-width: 0;
}

.buddy-chat-reasoning-group__header {
  display: inline-flex;
  width: max-content;
  max-width: 100%;
  min-width: 0;
  align-items: center;
  min-height: 24px;
  border: 0;
  background: transparent;
  color: var(--buddy-chat-tool-title-color);
  cursor: pointer;
  font: inherit;
  padding: 0;
  text-align: left;
}

.buddy-chat-reasoning-group__icon,
.buddy-chat-reasoning-group__chevron {
  width: var(--buddy-chat-node-icon-size);
  height: var(--buddy-chat-node-icon-size);
  flex: 0 0 auto;
}

.buddy-chat-reasoning-group__icon {
  margin-right: 6px;
}

.buddy-chat-reasoning-group__title {
  font-size: 14px;
  font-weight: 550;
  line-height: 24px;
  white-space: nowrap;
}

.buddy-chat-reasoning-group__chevron {
  margin-left: 6px;
  color: var(--buddy-chat-meta-color);
  transition: transform 120ms ease;

  &.is-open {
    transform: rotate(90deg) translateX(0.5px);
  }
}

.buddy-chat-reasoning-group__content {
  display: grid;
  min-width: 0;
  gap: var(--buddy-chat-gap-tight);
  margin-top: var(--buddy-chat-gap-tight);
  border-left: 2px solid color-mix(in srgb, var(--buddy-border-base) 78%, transparent);
  padding-left: 0.625rem;
}

@media (prefers-reduced-motion: reduce) {
  .buddy-chat-reasoning-group__chevron {
    transition: none;
  }
}
</style>
