<script setup lang="ts">
import ChatComposer from '@/components/chat-composer/ChatComposer.vue'
import { useChatInputBox } from '../composables/useChatInputBox'

const props = withDefaults(defineProps<{
  variant?: 'dock' | 'hero'
}>(), {
  variant: 'dock',
})

const {
  attachments,
  cancelActiveRun,
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
  <div class="chat-input-box" :class="`chat-input-box--${props.variant}`">
    <div class="chat-input-box__inner">
      <ChatComposer
        v-model:attachments="attachments"
        :content-j-s-o-n="contentJSON"
        :selected-model-ref="composerSelectedModelRef"
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
      <div v-if="props.variant === 'dock'" class="chat-input-box__hint">
        AI 回答仅供参考，请注意核实重要信息
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chat-input-box {
  padding: 1.25rem 1.5rem;
  border-top: 1px solid color-mix(in srgb, var(--brand-border-base) 80%, transparent);
  background-image: linear-gradient(
    180deg,
    transparent 0%,
    color-mix(in srgb, var(--brand-bg-surface) 88%, var(--brand-bg-body)) 100%
  );

  .chat-input-box__inner {
    max-width: 48rem;
    margin-inline: auto;
  }

  .chat-input-box__hint {
    margin-top: 0.5rem;
    color: color-mix(in srgb, var(--brand-text-secondary) 50%, transparent);
    font-size: 0.75rem;
    text-align: center;
  }

  &.chat-input-box--hero {
    padding: 0;
    border-top: 0;
    background-image: none;

    .chat-input-box__inner {
      max-width: none;
    }
  }
}
</style>
