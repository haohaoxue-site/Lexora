<script setup lang="ts">
import type { ChatContextBarEmits } from './typing'

const emits = defineEmits<ChatContextBarEmits>()
</script>

<template>
  <div class="chat-view-context flex w-full flex-wrap items-center justify-end gap-4">
    <div class="flex items-center gap-3">
      <ElButton class="chat-view-context__new-chat-btn h-8 rounded-[0.5rem] px-3.5 text-sm font-normal" @click="emits('newChat')">
        <span class="inline-flex items-center gap-[0.375rem]">
          <SvgIcon category="ui" icon="plus" size="0.875rem" />
          <span>新对话</span>
        </span>
      </ElButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chat-view-context__new-chat-btn {
  border-color: color-mix(in srgb, var(--brand-border-base) 72%, transparent);
  background: color-mix(in srgb, var(--brand-bg-surface) 82%, transparent);
  color: var(--brand-text-primary);
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    color 0.2s ease;

  &:hover,
  &:focus-visible {
    border-color: color-mix(in srgb, var(--brand-primary) 28%, var(--brand-border-base));
    background: color-mix(in srgb, var(--brand-primary) 6%, var(--brand-bg-surface));
    color: var(--brand-primary);
  }
}
</style>
