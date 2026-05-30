<script setup lang="ts">
import type { ChatSessionSummary } from '@/apis/chat'
import { ArrowDown } from '@element-plus/icons-vue'
import { computed, shallowRef } from 'vue'
import {
  buildDocsChatHistoryGroups,
  limitDocsChatHistorySessions,
} from '../utils/docsChatHistory'

const props = defineProps<{
  activeSessionId: string | null
  isLoading: boolean
  sessions: ChatSessionSummary[]
  title: string
}>()

const emits = defineEmits<{
  load: []
  select: [sessionId: string]
}>()

const historySessions = computed(() => limitDocsChatHistorySessions(props.sessions))
const historyGroups = computed(() => buildDocsChatHistoryGroups(historySessions.value))
const visible = shallowRef(false)

function selectSession(sessionId: string) {
  emits('select', sessionId)
  visible.value = false
}
</script>

<template>
  <ElPopover
    v-model:visible="visible"
    placement="bottom-start"
    trigger="click"
    :width="320"
    popper-class="docs-chat-history-dropdown__popover"
    @show="emits('load')"
  >
    <template #reference>
      <button type="button" class="docs-chat-history-dropdown__trigger">
        <span class="docs-chat-history-dropdown__trigger-title">{{ props.title }}</span>
        <ElIcon class="docs-chat-history-dropdown__trigger-icon">
          <ArrowDown />
        </ElIcon>
      </button>
    </template>

    <div
      v-loading="props.isLoading"
      class="docs-chat-history-dropdown"
      element-loading-text="正在加载"
    >
      <div v-if="historySessions.length === 0 && !props.isLoading" class="docs-chat-history-dropdown__empty">
        暂无历史对话
      </div>

      <template v-else>
        <section
          v-for="group in historyGroups"
          :key="group.id"
          class="docs-chat-history-dropdown__group"
        >
          <div class="docs-chat-history-dropdown__group-label">
            {{ group.label }}
          </div>

          <button
            v-for="session in group.sessions"
            :key="session.id"
            type="button"
            class="docs-chat-history-dropdown__item"
            :class="{ 'is-active': session.id === props.activeSessionId }"
            @click="selectSession(session.id)"
          >
            <span class="docs-chat-history-dropdown__item-title">
              {{ session.title }}
            </span>
          </button>
        </section>
      </template>
    </div>
  </ElPopover>
</template>

<style scoped lang="scss">
.docs-chat-history-dropdown__trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  max-width: 14rem;
  min-width: 0;
  height: 2rem;
  padding: 0 0.5rem;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  color: var(--brand-text-primary);
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.25rem;

  &:hover,
  &:focus-visible {
    background: color-mix(in srgb, var(--brand-fill-lighter) 72%, transparent);
    outline: none;
  }
}

.docs-chat-history-dropdown__trigger-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.docs-chat-history-dropdown__trigger-icon {
  flex: none;
  color: var(--brand-text-secondary);
  font-size: 0.75rem;
}

.docs-chat-history-dropdown {
  max-height: min(60vh, 26rem);
  min-height: 4rem;
  overflow-y: auto;
  padding: 0.375rem;
}

.docs-chat-history-dropdown__empty {
  padding: 1.25rem 0.75rem;
  color: var(--brand-text-secondary);
  font-size: 0.8125rem;
  text-align: center;
}

.docs-chat-history-dropdown__group + .docs-chat-history-dropdown__group {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid color-mix(in srgb, var(--brand-border-base) 64%, transparent);
}

.docs-chat-history-dropdown__group-label {
  padding: 0.25rem 0.5rem;
  color: var(--brand-text-secondary);
  font-size: 0.75rem;
  line-height: 1.125rem;
}

.docs-chat-history-dropdown__item {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  height: 2.125rem;
  padding: 0 0.5rem;
  border: 0;
  border-radius: 0.375rem;
  background: transparent;
  color: var(--brand-text-primary);
  cursor: pointer;
  text-align: left;

  &:hover,
  &:focus-visible,
  &.is-active {
    background: color-mix(in srgb, var(--brand-primary) 7%, transparent);
    outline: none;
  }
}

.docs-chat-history-dropdown__item-title {
  min-width: 0;
  overflow: hidden;
  font-size: 0.8125rem;
  line-height: 1.25rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.docs-chat-history-dropdown__popover) {
  padding: 0;
}
</style>
