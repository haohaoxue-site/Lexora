<script setup lang="ts">
import type { ChatComposerModelRef } from './typing'
import { AI_MODEL_INTENT_KEY } from '@haohaoxue/samepage-contracts'
import ModelCascader from '@/components/model-cascader'

const props = defineProps<{
  selectedModelRef?: ChatComposerModelRef | null
  disabled?: boolean
}>()

const emits = defineEmits<{
  select: [modelRef: ChatComposerModelRef | null]
}>()

function handleSelect(modelRef: ChatComposerModelRef | null) {
  emits('select', modelRef)
}
</script>

<template>
  <div class="chat-model-trigger" :class="{ 'is-disabled': props.disabled }">
    <ModelCascader
      :model-value="props.selectedModelRef"
      :intent-key="AI_MODEL_INTENT_KEY.CHAT_ASSISTANT_DEFAULT"
      :clearable="true"
      :filterable="true"
      :show-all-levels="false"
      :disabled="props.disabled"
      placeholder="选择模型"
      @update:model-value="handleSelect"
    />
  </div>
</template>

<style scoped lang="scss">
.chat-model-trigger {
  display: inline-flex;
  min-width: 0;

  :deep(.el-cascader) {
    width: auto;
    line-height: normal;
  }

  :deep(.el-cascader .el-input) {
    width: 9.4rem;
  }

  :deep(.el-cascader .el-input__wrapper) {
    min-height: 2rem;
    height: 2rem;
    padding: 0 0.4375rem 0 0.625rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 74%, transparent);
    border-radius: 0.5rem;
    background: transparent;
    box-shadow: none;
    transition:
      border-color 0.2s ease,
      background-color 0.2s ease;
  }

  :deep(.el-cascader:not(.is-disabled) .el-input__wrapper:hover) {
    border-color: color-mix(in srgb, var(--brand-border-base) 74%, transparent);
    background: color-mix(in srgb, var(--brand-fill-light) 72%, transparent);
  }

  :deep(.el-cascader .el-input.is-focus .el-input__wrapper),
  :deep(.el-cascader .el-input__wrapper.is-focus) {
    border-color: color-mix(in srgb, var(--brand-primary) 32%, transparent);
    box-shadow: none;
  }

  :deep(.el-cascader .el-input__inner) {
    height: 2rem;
    color: var(--brand-text-primary);
    font-size: 0.8125rem;
  }

  :deep(.el-cascader .el-input__inner::placeholder) {
    color: var(--brand-text-secondary);
  }

  :deep(.el-cascader .el-input__suffix) {
    color: var(--brand-text-secondary);
  }

  &.is-disabled {
    cursor: not-allowed;
  }
}
</style>
