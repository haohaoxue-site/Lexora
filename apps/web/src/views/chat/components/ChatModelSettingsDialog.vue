<script setup lang="ts">
import type { FormInstance } from 'element-plus'
import type { ModelCascaderModelRef } from '@/components/model-cascader/typing'
import { AI_MODEL_INTENT_KEY } from '@haohaoxue/samepage-contracts'
import { computed, useTemplateRef } from 'vue'
import { ModelCascader } from '@/components/model-cascader'
import { useChatModelSettingsDialog } from '../composables/useChatModelSettingsDialog'

const modelFormRef = useTemplateRef<FormInstance>('modelFormRef')
const {
  formRules,
  handleSave,
  modelSettingsDialogVisible,
  modelSettingsDraft,
} = useChatModelSettingsDialog({
  modelFormRef,
})

const selectedModelRef = computed<ModelCascaderModelRef | null>({
  get: () => modelSettingsDraft.modelRef ?? null,
  set: (value) => {
    modelSettingsDraft.modelRef = value
      ? {
          providerId: value.providerId,
          modelId: value.modelId,
        }
      : null
  },
})
</script>

<template>
  <ElDialog
    v-model="modelSettingsDialogVisible"
    title="选择模型"
    width="520"
    align-center
  >
    <div class="chat-model-settings">
      <ElForm ref="modelFormRef" :model="modelSettingsDraft" :rules="formRules" label-position="top" class="chat-model-settings__form">
        <ElFormItem prop="modelRef">
          <ModelCascader
            v-model="selectedModelRef"
            :intent-key="AI_MODEL_INTENT_KEY.CHAT_ASSISTANT_DEFAULT"
            :clearable="false"
            class="chat-model-settings__model-select w-full"
            filterable
            placeholder="请选择模型"
          />
        </ElFormItem>
      </ElForm>
    </div>

    <template #footer>
      <div class="chat-model-settings__footer">
        <ElButton @click="modelSettingsDialogVisible = false">
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
.chat-model-settings {
  > * + * {
    margin-top: 1.25rem;
  }

  .chat-model-settings__form {
    > * + * {
      margin-top: 1rem;
    }
  }

  .chat-model-settings__model-select {
    width: 100%;
  }

  .chat-model-settings__footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
  }
}
</style>
