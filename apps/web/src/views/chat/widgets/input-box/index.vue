<script setup lang="ts">
import type { ChatInputBoxProps } from './typing'
import ChatComposer from '@/components/chat-composer/ChatComposer.vue'
import { useChatInputBox } from '../../composables/useChatInputBox'

const props = withDefaults(defineProps<ChatInputBoxProps>(), {
  variant: 'dock',
})

const {
  attachments,
  cancelActiveRun,
  composerModelSelectionKind,
  composerSelectedModelRef,
  contentJSON,
  handlePlaceholderCommand,
  handlePlaceholderUpload,
  handleSend,
  highlightAttachment,
  highlightAttachmentId,
  isStreaming,
  selectComposerModel,
} = useChatInputBox()
</script>

<template>
  <div class="chat-input-box" :class="props.variant === 'hero' ? 'chat-input-box--hero p-0' : 'px-6 py-5'">
    <div class="mx-auto" :class="props.variant === 'hero' ? 'max-w-none' : 'max-w-[var(--page-mode-chat-max-width)]'">
      <ChatComposer
        v-model:attachments="attachments"
        :content-j-s-o-n="contentJSON"
        :selected-model-ref="composerSelectedModelRef"
        :model-selection-kind="composerModelSelectionKind"
        :is-streaming="isStreaming"
        :highlight-attachment-id="highlightAttachmentId"
        document-picker-teleport-to=".chat-view__picker-layer"
        @update:content-j-s-o-n="contentJSON = $event"
        @send="handleSend"
        @stop="cancelActiveRun"
        @select-model="selectComposerModel"
        @placeholder-upload="handlePlaceholderUpload"
        @placeholder-command="handlePlaceholderCommand"
        @highlight-attachment="highlightAttachment"
      />
      <div v-if="props.variant === 'dock'" class="mt-2 text-center text-xs text-secondary-a50">
        AI 回答仅供参考，请注意核实重要信息
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chat-input-box {
  border-top: 1px solid color-mix(in srgb, var(--brand-border-base) 80%, transparent);
  background-image: linear-gradient(
    180deg,
    transparent 0%,
    color-mix(in srgb, var(--brand-bg-surface) 88%, var(--brand-bg-body)) 100%
  );

  &.chat-input-box--hero {
    border-top: 0;
    background-image: none;
  }
}
</style>
