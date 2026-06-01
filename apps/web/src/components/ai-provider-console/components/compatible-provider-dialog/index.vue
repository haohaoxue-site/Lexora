<script setup lang="ts">
import type { FormInstance } from 'element-plus'
import type { AiProviderFormController } from '../../typing'
import type {
  AiCompatibleProviderDialogEmits,
  AiCompatibleProviderDialogProps,
} from './typing'
import { computed, useTemplateRef } from 'vue'

const props = defineProps<AiCompatibleProviderDialogProps>()
const emit = defineEmits<AiCompatibleProviderDialogEmits>()
const visible = defineModel<boolean>('visible', { required: true })

const formRef = useTemplateRef<FormInstance>('formRef')

const dialogTitle = computed(() => props.mode === 'create' ? '添加服务商' : '编辑服务商')
const confirmText = computed(() => props.mode === 'create' ? '添加' : '保存')

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
  <ElDialog v-model="visible" :title="dialogTitle" width="28rem">
    <ElForm ref="formRef" :model="form" :rules="rules" label-position="top">
      <ElFormItem label="类型" prop="providerKey">
        <ElSelect v-model="form.providerKey" class="w-full">
          <ElOption
            v-for="template in presets"
            :key="template.providerKey"
            :label="template.providerName"
            :value="template.providerKey"
          />
        </ElSelect>
      </ElFormItem>
      <ElFormItem label="名称" prop="providerName">
        <ElInput v-model="form.providerName" :placeholder="mode === 'create' ? '例如：本地 Xinference' : undefined" />
      </ElFormItem>
    </ElForm>

    <template #footer>
      <ElButton @click="visible = false">
        取消
      </ElButton>
      <ElButton type="primary" :loading="loading" @click="emit('submit')">
        {{ confirmText }}
      </ElButton>
    </template>
  </ElDialog>
</template>
