<script setup lang="ts">
import type { AgentSkillCard, AgentTranslatorSkillConfig } from '@haohaoxue/samepage-contracts'
import type { FormInstance } from 'element-plus'
import { reactive, ref, watch } from 'vue'
import {
  createTranslatorConfigFormModel,
  toTranslatorSkillConfig,
  translatorFormalityOptions,
  translatorOutputModeOptions,
} from '../../utils/translator'

const props = defineProps<{
  skill: AgentSkillCard | null
  saving: boolean
}>()
const emit = defineEmits<{
  submit: [config: AgentTranslatorSkillConfig]
}>()
const visible = defineModel<boolean>('visible', { required: true })
const formRef = ref<FormInstance>()
const formModel = reactive(createTranslatorConfigFormModel(null))

watch(
  () => [props.skill?.key, props.skill?.config, visible.value] as const,
  () => {
    if (!visible.value) {
      return
    }

    Object.assign(formModel, createTranslatorConfigFormModel(props.skill?.config ?? null))
  },
  { immediate: true },
)

async function handleSubmit() {
  await formRef.value?.validate()
  emit('submit', toTranslatorSkillConfig(formModel))
}
</script>

<template>
  <ElDrawer
    v-model="visible"
    title="翻译设置"
    size="32rem"
    destroy-on-close
  >
    <ElForm
      ref="formRef"
      :model="formModel"
      label-position="top"
      class="translator-config-form"
    >
      <ElFormItem label="输出模式">
        <ElSegmented v-model="formModel.outputMode" :options="translatorOutputModeOptions" block class="w-full" />
      </ElFormItem>

      <ElFormItem label="语气">
        <ElSegmented v-model="formModel.formality" :options="translatorFormalityOptions" block class="w-full" />
      </ElFormItem>

      <ElFormItem>
        <ElCheckbox v-model="formModel.preserveFormatting">
          保留 Markdown、列表、表格、链接和代码块结构
        </ElCheckbox>
      </ElFormItem>
    </ElForm>

    <template #footer>
      <div class="flex justify-end gap-2">
        <ElButton :disabled="saving" @click="visible = false">
          取消
        </ElButton>
        <ElButton type="primary" :loading="saving" @click="handleSubmit">
          保存
        </ElButton>
      </div>
    </template>
  </ElDrawer>
</template>
