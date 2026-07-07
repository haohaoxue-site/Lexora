<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { BuddyChatRunEvent, BuddyMessage } from '@/lib/tauriRuntime'
import { computed, shallowRef, useTemplateRef, watch } from 'vue'
import BuddyChatActivityRow from '@/chat/BuddyChatActivityRow.vue'
import BuddyChatMessageRow from '@/chat/BuddyChatMessageRow.vue'
import BuddyChatOrnamentScrollbar from '@/chat/BuddyChatOrnamentScrollbar.vue'
import BuddyChatReferencesRow from '@/chat/BuddyChatReferencesRow.vue'
import BuddyChatRunDetailsRow from '@/chat/BuddyChatRunDetailsRow.vue'
import BuddyChatRunStatusRow from '@/chat/BuddyChatRunStatusRow.vue'
import { createChatMessageViewRowCache } from '@/chat/chatMessageView'
import {
  createChatTranscriptRows,
  createChatTranscriptRunGroupCache,
  createVisibleChatTranscriptRows,
} from '@/chat/chatTranscriptView'
import { useDynamicBuddyVirtualList } from '@/chat/useDynamicBuddyVirtualList'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  language: BuddyLocale
  messages: ReadonlyArray<BuddyMessage>
  runEvents?: ReadonlyArray<BuddyChatRunEvent>
}>()

const { t } = useBuddyI18n(() => props.language)
const messageRowCache = createChatMessageViewRowCache()
const runGroupCache = createChatTranscriptRunGroupCache()
const scrollContainerRef = useTemplateRef<HTMLElement>('scrollContainerRef')
const collapsedRunIds = shallowRef<ReadonlySet<string>>(new Set())

const transcriptRows = computed(() =>
  createChatTranscriptRows(props.messages, props.runEvents ?? [], t, {
    cacheKeySalt: props.language,
    messageRowCache,
    runGroupCache,
  }),
)

const listKey = computed(() => {
  const conversationId = props.messages[0]?.conversationId
    ?? props.runEvents?.[0]?.runId
  return conversationId ?? 'buddy-chat'
})

const collapsibleRunIds = computed(() => {
  const runIds = new Set<string>()
  for (const row of transcriptRows.value) {
    if (row.type === 'activity' || row.type === 'run-details') {
      runIds.add(row.runId)
      continue
    }

    if (row.type === 'message' && row.runId && row.flow === 'process')
      runIds.add(row.runId)
  }

  return runIds
})

const effectiveCollapsedRunIds = computed(() => {
  const runIds = new Set<string>()
  for (const runId of collapsedRunIds.value) {
    if (collapsibleRunIds.value.has(runId))
      runIds.add(runId)
  }

  return runIds
})

const rows = computed(() => createVisibleChatTranscriptRows(transcriptRows.value, effectiveCollapsedRunIds.value))

watch(listKey, () => {
  collapsedRunIds.value = new Set()
})

const {
  handleScroll,
  scrollTop,
  setItemElement,
  spacerStyle,
  totalHeight,
  viewportHeight,
  virtualItems,
} = useDynamicBuddyVirtualList({
  bottomThreshold: 96,
  estimateSize: 112,
  getItemKey: row => row.key,
  items: rows,
  listKey,
  overscan: 10,
  scrollContainerRef,
})

function setVirtualItemElement(key: string, element: Element | ComponentPublicInstance | null) {
  setItemElement(key, element instanceof Element ? element : null)
}

function handleOrnamentScrollTo(nextScrollTop: number) {
  const element = scrollContainerRef.value
  if (!element)
    return

  element.scrollTop = nextScrollTop
  handleScroll()
}

function canToggleRunProcess(runId: string) {
  return collapsibleRunIds.value.has(runId)
}

function isRunProcessCollapsed(runId: string) {
  return effectiveCollapsedRunIds.value.has(runId)
}

function toggleRunProcess(runId: string) {
  if (!collapsibleRunIds.value.has(runId))
    return

  const nextRunIds = new Set(collapsedRunIds.value)
  if (nextRunIds.has(runId)) {
    nextRunIds.delete(runId)
  }
  else {
    nextRunIds.add(runId)
  }

  collapsedRunIds.value = nextRunIds
}
</script>

<template>
  <div class="buddy-chat-messages">
    <div
      ref="scrollContainerRef"
      class="buddy-chat-messages__viewport"
      @scroll="handleScroll"
    >
      <div
        class="buddy-chat-messages__virtual-space"
        :style="spacerStyle"
      >
        <div
          v-for="virtual in virtualItems"
          :key="virtual.key"
          :ref="element => setVirtualItemElement(virtual.key, element)"
          class="buddy-chat-messages__virtual-item"
          :style="virtual.style"
        >
          <BuddyChatMessageRow
            v-if="virtual.item.type === 'message'"
            :row="virtual.item"
          />
          <BuddyChatRunStatusRow
            v-else-if="virtual.item.type === 'run'"
            :can-toggle-process="canToggleRunProcess(virtual.item.runId)"
            :is-process-collapsed="isRunProcessCollapsed(virtual.item.runId)"
            :row="virtual.item"
            @toggle-process="toggleRunProcess"
          />
          <BuddyChatRunDetailsRow
            v-else-if="virtual.item.type === 'run-details'"
            :row="virtual.item"
          />
          <BuddyChatReferencesRow
            v-else-if="virtual.item.type === 'references'"
            :row="virtual.item"
          />
          <BuddyChatActivityRow
            v-else
            :language="language"
            :row="virtual.item"
          />
        </div>
      </div>
    </div>

    <BuddyChatOrnamentScrollbar
      :content-height="totalHeight"
      :scroll-top="scrollTop"
      :viewport-height="viewportHeight"
      @scroll-to="handleOrnamentScrollTo"
    />
  </div>
</template>

<style scoped lang="scss">
.buddy-chat-messages {
  position: relative;
  height: 100%;
  min-height: 0;
}

.buddy-chat-messages__viewport {
  height: 100%;
  min-height: 0;
  overflow-anchor: none;
  overflow-y: auto;
  scrollbar-color: transparent transparent;
  scrollbar-gutter: auto;
  scrollbar-width: none;
  padding: 3px max(34px, calc((100% - 720px) / 2 + 34px)) 6px max(24px, calc((100% - 720px) / 2 + 24px));
}

.buddy-chat-messages__viewport::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.buddy-chat-messages__viewport::-webkit-scrollbar-track {
  background: transparent;
}

.buddy-chat-messages__viewport::-webkit-scrollbar-thumb {
  border: 5px solid transparent;
  border-radius: 8px;
  background: transparent;
}

.buddy-chat-messages__virtual-item {
  box-sizing: border-box;
  padding-bottom: 10px;
}

@media (max-width: 620px) {
  .buddy-chat-messages__viewport {
    padding: 2px 30px 5px 18px;
  }
}
</style>
