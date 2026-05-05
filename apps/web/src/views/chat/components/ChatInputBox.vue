<script setup lang="ts">
import type { ChatInputBoxEmits, ChatInputBoxProps } from '../typing'
import { useChatInputBox } from '../composables/useChatInputBox'

const props = withDefaults(defineProps<ChatInputBoxProps>(), {
  placeholder: '输入消息...',
})
const emits = defineEmits<ChatInputBoxEmits>()
const { handleKeydown, handleSend, inputText, isSendDisabled } = useChatInputBox(
  props,
  content => emits('send', content),
)
</script>

<template>
  <div class="chat-input-box">
    <div class="chat-input-box__inner">
      <div class="chat-input-box__surface">
        <ElInput
          v-model="inputText"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 6 }"
          :placeholder="props.placeholder"
          :disabled="props.disabled"
          class="chat-input-box__field"
          @keydown="handleKeydown"
        />
        <ElButton
          type="primary"
          circle
          :disabled="isSendDisabled"
          class="chat-input-box__send"
          @click="handleSend"
        >
          <SvgIcon category="ui" icon="send-light" size="1rem" class="chat-input-box__send-icon" />
        </ElButton>
      </div>
      <div class="chat-input-box__hint">
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

  .chat-input-box__surface {
    display: flex;
    align-items: flex-end;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 80%, transparent);
    border-radius: 22px;
    background: var(--brand-bg-surface-raised);
    transition: border-color 0.2s ease;
    box-shadow: var(--brand-shadow-floating);

    &:focus-within {
      border-color: color-mix(in srgb, var(--brand-primary) 30%, transparent);
    }
  }

  .chat-input-box__field {
    :deep(.el-textarea__inner) {
      padding: 0;
      background: transparent;
      box-shadow: none;
      resize: none;
      border: none;
      font-size: 14px;
      line-height: 1.6;
      color: var(--brand-text-primary);
    }

    :deep(.el-textarea__inner::placeholder) {
      color: var(--brand-text-placeholder);
    }
  }

  .chat-input-box__send {
    margin-bottom: 0.125rem;
  }

  .chat-input-box__send-icon {
    display: block;
  }

  .chat-input-box__hint {
    margin-top: 0.5rem;
    color: color-mix(in srgb, var(--brand-text-secondary) 50%, transparent);
    font-size: 0.75rem;
    text-align: center;
  }
}
</style>
