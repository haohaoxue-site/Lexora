<script setup lang="ts">
import type {
  BuddyChatMessageListHandle,
  ChatMessageScrollAnchor,
  ChatMessageScrollMetrics,
} from './chatMessageViewport'
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'
import BuddyChatReturnToLatest from './BuddyChatReturnToLatest.vue'
import { resolvePrependedChatScrollTop } from './chatMessageViewport'

const props = defineProps<{
  hasOlderMessages: boolean
  returnToLatestLabel: string
  showReturnToLatest: boolean
}>()

const emit = defineEmits<{
  contentResize: [metrics: ChatMessageScrollMetrics]
  returnToLatest: []
  scroll: [metrics: ChatMessageScrollMetrics]
}>()

const viewport = useTemplateRef<HTMLElement>('viewport')
const content = useTemplateRef<HTMLElement>('content')
let resizeObserver: ResizeObserver | null = null

function readScrollMetrics(): ChatMessageScrollMetrics | null {
  return viewport.value ? toScrollMetrics(viewport.value) : null
}

function captureScrollAnchor(): ChatMessageScrollAnchor | null {
  const scrollport = viewport.value
  const metrics = readScrollMetrics()
  if (!scrollport || !metrics)
    return null
  const viewportTop = scrollport.getBoundingClientRect().top
  const message = [...scrollport.querySelectorAll<HTMLElement>('[data-message-id]')]
    .find(element => element.getBoundingClientRect().bottom > viewportTop)
  if (!message?.dataset.messageId)
    return null
  return {
    messageId: message.dataset.messageId,
    messageOffsetTop: message.getBoundingClientRect().top - viewportTop,
    metrics,
  }
}

function restoreScrollAnchor(anchor: ChatMessageScrollAnchor): ChatMessageScrollMetrics | null {
  const scrollport = viewport.value
  if (!scrollport)
    return null
  const anchorMessage = findMessage(anchor.messageId)
  if (anchorMessage) {
    const currentOffset = anchorMessage.getBoundingClientRect().top
      - scrollport.getBoundingClientRect().top
    scrollport.scrollTop += currentOffset - anchor.messageOffsetTop
  }
  else {
    scrollport.scrollTop = resolvePrependedChatScrollTop(
      anchor.metrics,
      toScrollMetrics(scrollport),
    )
  }
  return toScrollMetrics(scrollport)
}

function scrollToMessage(messageId: string): ChatMessageScrollMetrics | null {
  const scrollport = viewport.value
  const message = findMessage(messageId)
  if (!scrollport || !message)
    return null
  scrollport.scrollTop += message.getBoundingClientRect().top
    - scrollport.getBoundingClientRect().top
  return toScrollMetrics(scrollport)
}

function scrollToTail(): ChatMessageScrollMetrics | null {
  const scrollport = viewport.value
  if (!scrollport)
    return null
  scrollport.scrollTop = scrollport.scrollHeight
  return toScrollMetrics(scrollport)
}

function findMessage(messageId: string): HTMLElement | null {
  return [...viewport.value?.querySelectorAll<HTMLElement>('[data-message-id]') ?? []]
    .find(element => element.dataset.messageId === messageId)
    ?? null
}

function handleScroll() {
  const metrics = readScrollMetrics()
  if (metrics)
    emit('scroll', metrics)
}

onMounted(() => {
  if (!content.value || typeof ResizeObserver === 'undefined')
    return
  resizeObserver = new ResizeObserver(() => {
    const metrics = readScrollMetrics()
    if (metrics)
      emit('contentResize', metrics)
  })
  resizeObserver.observe(content.value)
})

onBeforeUnmount(() => resizeObserver?.disconnect())

defineExpose<BuddyChatMessageListHandle>({
  captureScrollAnchor,
  readScrollMetrics,
  restoreScrollAnchor,
  scrollToMessage,
  scrollToTail,
})

function toScrollMetrics(element: HTMLElement): ChatMessageScrollMetrics {
  return {
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }
}
</script>

<template>
  <div class="buddy-chat-transcript-viewport">
    <div
      ref="viewport"
      class="buddy-chat-transcript-viewport__scrollport"
      data-chat-scroll-viewport
      tabindex="0"
      @scroll.passive="handleScroll"
    >
      <div
        ref="content"
        class="buddy-chat-transcript-viewport__content"
        :class="{ 'has-older-messages': props.hasOlderMessages }"
      >
        <slot />
      </div>
    </div>
    <Transition name="buddy-chat-return-to-latest">
      <div
        v-if="showReturnToLatest"
        class="buddy-chat-transcript-viewport__return"
      >
        <BuddyChatReturnToLatest
          :label="returnToLatestLabel"
          @activate="emit('returnToLatest')"
        />
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.buddy-chat-transcript-viewport {
  position: relative;
  height: 100%;
  min-height: 0;
}

.buddy-chat-transcript-viewport__scrollport {
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;

  &:focus-visible {
    outline: 1px solid var(--buddy-focus-ring);
    outline-offset: -1px;
  }
}

.buddy-chat-transcript-viewport__content {
  min-height: 100%;
  padding-block: 1.5rem 1rem;

  &.has-older-messages {
    padding-top: 2rem;
  }
}

.buddy-chat-transcript-viewport__return {
  position: absolute;
  z-index: 3;
  bottom: 0.85rem;
  left: 50%;
  transform: translateX(-50%);
}

.buddy-chat-return-to-latest-enter-active {
  transition:
    opacity 160ms ease-out,
    transform 160ms var(--buddy-motion-state-easing);
}

.buddy-chat-return-to-latest-leave-active {
  pointer-events: none;
  transition:
    opacity 160ms ease-in,
    transform 160ms ease-in;
}

.buddy-chat-return-to-latest-enter-from,
.buddy-chat-return-to-latest-leave-to {
  opacity: 0;
  transform: translate(-50%, 0.35rem) scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
  .buddy-chat-return-to-latest-enter-active,
  .buddy-chat-return-to-latest-leave-active {
    transition: none;
  }

  .buddy-chat-return-to-latest-enter-from,
  .buddy-chat-return-to-latest-leave-to {
    transform: translateX(-50%);
  }
}
</style>
