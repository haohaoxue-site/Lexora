<script setup lang="ts">
import type { FormInstance } from 'element-plus'
import type { AiProviderFormController } from '../../typing'
import type {
  AiProviderCreateModelDialogEmits,
  AiProviderCreateModelDialogProps,
} from './typing'
import { useTemplateRef } from 'vue'

defineProps<AiProviderCreateModelDialogProps>()

const emit = defineEmits<AiProviderCreateModelDialogEmits>()
const visible = defineModel<boolean>('visible', { required: true })
const formRef = useTemplateRef<FormInstance>('formRef')

async function validate() {
  return await formRef.value?.validate().catch(() => false) ?? false
}

function clearValidate() {
  formRef.value?.clearValidate()
}

defineExpose<AiProviderFormController>({
  validate,
  clearValidate,
})
</script>

<template>
  <ElDialog v-model="visible" title="添加模型" width="42rem">
    <ElForm
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="7rem"
    >
      <ElFormItem label="模型 ID" prop="modelId" required>
        <ElInput
          :model-value="form.modelId"
          placeholder="例如：gpt-4.1"
          @input="value => emit('modelIdInput', String(value))"
        />
      </ElFormItem>
      <ElFormItem label="模型名称" prop="modelName">
        <ElInput v-model="form.modelName" placeholder="例如：GPT-4.1" />
      </ElFormItem>
    </ElForm>

    <template #footer>
      <ElButton @click="visible = false">
        取消
      </ElButton>
      <ElButton type="primary" :loading="loading" @click="emit('submit')">
        添加模型
      </ElButton>
    </template>
  </ElDialog>
</template>
