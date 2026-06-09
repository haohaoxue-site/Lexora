<script setup lang="ts">
import type { FormInstance } from 'element-plus'
import type {
  AiProviderModelCapabilityDialogEmits,
  AiProviderModelCapabilityDialogProps,
} from './typing'
import { useTemplateRef } from 'vue'
import {
  AI_MODEL_CAPABILITY_OPTIONS,
  AI_MODEL_MODALITY_OPTIONS,
  AI_MODEL_TYPE_OPTIONS,
} from '../../utils/modelDisplay'

defineProps<AiProviderModelCapabilityDialogProps>()

const emit = defineEmits<AiProviderModelCapabilityDialogEmits>()
const visible = defineModel<boolean>('visible', { required: true })
const formRef = useTemplateRef<FormInstance>('formRef')

async function handleSubmit() {
  const isValid = await formRef.value?.validate().catch(() => false)
  if (isValid) {
    emit('submit')
  }
}
</script>

<template>
  <ElDialog
    v-model="visible"
    title="配置模型能力"
    width="46rem"
    class="ai-provider-console__model-capability-dialog"
  >
    <ElForm
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="7.5rem"
      class="ai-provider-console__model-capability-form"
    >
      <ElFormItem label="模型 ID" prop="modelId" required>
        <ElInput v-model="form.modelId" disabled />
      </ElFormItem>
      <ElFormItem label="模型名称" prop="modelName">
        <ElInput v-model="form.modelName" />
      </ElFormItem>
      <ElFormItem label="模型用途" prop="modelType">
        <ElSelect v-model="form.modelType" class="w-full">
          <ElOption
            v-for="option in AI_MODEL_TYPE_OPTIONS"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </ElSelect>
      </ElFormItem>
      <ElFormItem label="输入模态" prop="inputModalities">
        <ElCheckboxGroup v-model="form.inputModalities" class="ai-provider-console__checkbox-grid">
          <ElCheckbox
            v-for="option in AI_MODEL_MODALITY_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </ElCheckbox>
        </ElCheckboxGroup>
      </ElFormItem>
      <ElFormItem label="输出模态" prop="outputModalities">
        <ElCheckboxGroup v-model="form.outputModalities" class="ai-provider-console__checkbox-grid">
          <ElCheckbox
            v-for="option in AI_MODEL_MODALITY_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </ElCheckbox>
        </ElCheckboxGroup>
      </ElFormItem>
      <ElFormItem label="模型能力" prop="capabilities">
        <ElCheckboxGroup v-model="form.capabilities" class="ai-provider-console__checkbox-grid">
          <ElCheckbox
            v-for="option in AI_MODEL_CAPABILITY_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </ElCheckbox>
        </ElCheckboxGroup>
      </ElFormItem>
      <div class="ai-provider-console__model-limit-grid">
        <ElFormItem label="上下文窗口" prop="contextWindow">
          <ElInputNumber
            v-model="form.contextWindow"
            :min="1"
            :precision="0"
            controls-position="right"
            class="w-full"
            placeholder="未配置"
          />
        </ElFormItem>
        <ElFormItem label="最大输出" prop="maxOutputTokens">
          <ElInputNumber
            v-model="form.maxOutputTokens"
            :min="1"
            :precision="0"
            controls-position="right"
            class="w-full"
            placeholder="未配置"
          />
        </ElFormItem>
      </div>
    </ElForm>

    <template #footer>
      <ElButton @click="visible = false">
        取消
      </ElButton>
      <ElButton type="primary" :loading="loading" @click="handleSubmit">
        保存配置
      </ElButton>
    </template>
  </ElDialog>
</template>
