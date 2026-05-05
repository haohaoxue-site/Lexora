<script setup lang="ts">
import type { FormInstance } from 'element-plus'
import type { ChatProviderSettingsDialogEmits } from '../typing'
import type { ChatModelSelection } from '@/apis/chat'
import type { ModelCascaderModelRef } from '@/components/model-cascader/typing'
import { AI_MODEL_INTENT_KEY } from '@haohaoxue/samepage-contracts'
import { computed, useTemplateRef } from 'vue'
import { ModelCascader } from '@/components/model-cascader'
import { useChatProviderSettingsDialog } from '../composables/useChatProviderSettingsDialog'

const emits = defineEmits<ChatProviderSettingsDialogEmits>()
const visible = defineModel<boolean>({ required: true })
const form = defineModel<ChatModelSelection>('form', { required: true })
const providerFormRef = useTemplateRef<FormInstance>('providerFormRef')
const { formRules, handleSave } = useChatProviderSettingsDialog({
  form,
  providerFormRef,
  onSave: () => emits('save'),
})

const selectedModelRef = computed<ModelCascaderModelRef | null>({
  get: () => form.value.modelRef ?? null,
  set: (value) => {
    form.value.modelRef = value
      ? {
          configId: value.configId,
          modelId: value.modelId,
        }
      : undefined
  },
})
</script>

<template>
  <ElDialog
    v-model="visible"
    title="选择模型"
    width="520"
    align-center
  >
    <div class="chat-provider-settings">
      <p class="chat-provider-settings__description">
        从系统或个人模型服务中选择本次聊天使用的模型。
      </p>

      <ElForm ref="providerFormRef" :model="form" :rules="formRules" label-position="top" class="chat-provider-settings__form">
        <ElFormItem prop="modelRef">
          <ModelCascader
            v-model="selectedModelRef"
            :intent-key="AI_MODEL_INTENT_KEY.CHAT_DEFAULT"
            class="chat-provider-settings__model-select w-full"
            filterable
            placeholder="请选择模型"
          />
        </ElFormItem>
      </ElForm>
    </div>

    <template #footer>
      <div class="chat-provider-settings__footer">
        <ElButton @click="visible = false">
          取消
        </ElButton>
        <ElButton type="primary" @click="handleSave">
          保存配置
        </ElButton>
      </div>
    </template>
  </ElDialog>
</template>

<style scoped lang="scss">
.chat-provider-settings {
  > * + * {
    margin-top: 1.25rem;
  }

  .chat-provider-settings__description {
    margin: 0;
    color: var(--brand-text-secondary);
    font-size: 0.75rem;
    line-height: 1.25rem;
  }

  .chat-provider-settings__form {
    > * + * {
      margin-top: 1rem;
    }
  }

  .chat-provider-settings__model-select {
    width: 100%;
  }

  .chat-provider-settings__footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
  }
}
</style>
