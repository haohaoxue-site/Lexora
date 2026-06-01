<script setup lang="ts">
import type {
  ChatWorkspaceLayoutEmits,
  ChatWorkspaceLayoutProps,
} from './typing'
import ChatInputBox from '../../widgets/input-box'
import ChatMessageList from '../../widgets/message-list'
import ChatSessionSidebar from '../../widgets/session-sidebar'

const props = defineProps<ChatWorkspaceLayoutProps>()
const emits = defineEmits<ChatWorkspaceLayoutEmits>()
</script>

<template>
  <div class="chat-view flex h-full min-h-0">
    <ChatSessionSidebar
      v-if="!props.isSidebarCollapsed"
      @collapse="emits('collapseSidebar')"
    />

    <div class="chat-view__conversation relative flex min-h-0 flex-1 flex-col">
      <div class="chat-view__picker-layer pointer-events-none absolute inset-0 z-[8]" />

      <ElButton
        v-if="props.isSidebarCollapsed"
        text
        circle
        size="small"
        class="chat-view__pin-sidebar-btn absolute left-4 top-4 z-[2] h-8 w-8"
        title="显示对话列表"
        @click="emits('showSidebar')"
      >
        <SvgIcon category="ui" icon="pin" size="1rem" />
      </ElButton>

      <section v-if="props.isNewChatRoute" class="chat-view-new flex h-full min-h-0 flex-1 items-center justify-center p-8">
        <div class="chat-view-new__content w-full max-w-3xl -translate-y-[8vh]">
          <h1 class="m-0 mb-2 text-center text-2xl leading-8 text-main font-semibold">
            有什么可以帮助你的？
          </h1>
          <p class="m-0 mb-7 text-center text-[0.9375rem] leading-[1.5] text-secondary">
            问我任何问题，随时开始
          </p>
          <ChatInputBox variant="hero" />
        </div>
      </section>

      <template v-else>
        <ChatMessageList />
        <ChatInputBox />
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chat-view__pin-sidebar-btn {
  border: 1px solid color-mix(in srgb, var(--brand-border-base) 72%, transparent);
  background: color-mix(in srgb, var(--brand-bg-surface) 88%, transparent);
  color: var(--brand-text-secondary);

  &:hover,
  &:focus-visible {
    border-color: color-mix(in srgb, var(--brand-primary) 28%, var(--brand-border-base));
    background: color-mix(in srgb, var(--brand-primary) 6%, var(--brand-bg-surface));
    color: var(--brand-primary);
  }
}
</style>
