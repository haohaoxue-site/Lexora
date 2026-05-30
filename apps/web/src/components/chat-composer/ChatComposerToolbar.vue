<script setup lang="ts">
import type { ChatComposerModelRef } from './typing'
import { CloseBold } from '@element-plus/icons-vue'
import ChatModelTrigger from './ChatModelTrigger.vue'

const props = defineProps<{
  selectedModelRef?: ChatComposerModelRef | null
  isStreaming?: boolean
  disabled?: boolean
  canSend?: boolean
}>()

const emits = defineEmits<{
  openPanelPicker: []
  placeholderUpload: []
  placeholderCommand: []
  selectModel: [modelRef: ChatComposerModelRef | null]
  send: []
  stop: []
}>()
</script>

<template>
  <div class="chat-composer-toolbar">
    <div class="chat-composer-toolbar__left">
      <ElTooltip content="上传文件" placement="top">
        <button
          class="chat-composer-toolbar__icon-button"
          type="button"
          :disabled="props.disabled"
          aria-label="上传文件"
          @click="emits('placeholderUpload')"
        >
          <SvgIcon category="ui" icon="plus" size="1rem" />
        </button>
      </ElTooltip>

      <ElTooltip content="选择文档" placement="top">
        <button
          class="chat-composer-toolbar__icon-button"
          type="button"
          :disabled="props.disabled"
          aria-label="选择文档"
          @click="emits('openPanelPicker')"
        >
          <span class="chat-composer-toolbar__symbol">@</span>
        </button>
      </ElTooltip>

      <ElTooltip content="命令" placement="top">
        <button
          class="chat-composer-toolbar__icon-button"
          type="button"
          :disabled="props.disabled"
          aria-label="命令"
          @click="emits('placeholderCommand')"
        >
          <span class="chat-composer-toolbar__symbol">/</span>
        </button>
      </ElTooltip>
    </div>

    <div class="chat-composer-toolbar__right">
      <ChatModelTrigger
        :selected-model-ref="props.selectedModelRef"
        :disabled="props.isStreaming"
        @select="emits('selectModel', $event)"
      />

      <ElTooltip :content="props.isStreaming ? '停止生成' : '发送'" placement="top">
        <button
          v-if="props.isStreaming"
          class="chat-composer-toolbar__send-button is-stop"
          type="button"
          aria-label="停止生成"
          @click="emits('stop')"
        >
          <ElIcon><CloseBold /></ElIcon>
        </button>
        <button
          v-else
          class="chat-composer-toolbar__send-button"
          type="button"
          :disabled="props.disabled || !props.canSend"
          aria-label="发送"
          @click="emits('send')"
        >
          <SvgIcon category="ui" icon="send-light" size="1rem" />
        </button>
      </ElTooltip>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chat-composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem 0.625rem 0.625rem;

  .chat-composer-toolbar__left,
  .chat-composer-toolbar__right {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
  }

  .chat-composer-toolbar__right {
    margin-left: auto;
  }

  .chat-composer-toolbar__icon-button,
  .chat-composer-toolbar__send-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 72%, transparent);
    border-radius: 0.5rem;
    background: transparent;
    color: var(--brand-text-secondary);
    cursor: pointer;

    &:hover:not(:disabled) {
      color: var(--brand-text-primary);
      background: color-mix(in srgb, var(--brand-fill-light) 72%, transparent);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.48;
    }
  }

  .chat-composer-toolbar__send-button {
    border-color: var(--brand-primary);
    background: var(--brand-primary);
    color: #fff;

    &:hover:not(:disabled) {
      color: #fff;
      background: color-mix(in srgb, var(--brand-primary) 88%, #000);
    }
  }

  .chat-composer-toolbar__send-button.is-stop {
    border-color: var(--el-color-danger);
    background: var(--el-color-danger);
  }

  .chat-composer-toolbar__symbol {
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1;
  }
}
</style>
