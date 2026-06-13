<script setup lang="ts">
import type { FormInstance } from 'element-plus'
import type {
  CollaborationPasswordFormEmits,
  CollaborationPasswordFormExposed,
  CollaborationPasswordFormProps,
} from './typing'
import { DOCUMENT_COLLABORATION_LINK_PASSWORD_LENGTH } from '@haohaoxue/lexora-contracts/document/collaboration/constants'
import { reactive, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<CollaborationPasswordFormProps>()
const emit = defineEmits<CollaborationPasswordFormEmits>()
const { t } = useI18n()
const passwordFormRef = useTemplateRef<FormInstance>('passwordFormRef')
const form = reactive({
  password: props.password,
})

watch(
  () => props.password,
  (password) => {
    if (form.password !== password) {
      form.password = password
    }
  },
)

watch(
  () => form.password,
  (password) => {
    emit('update:password', password)
  },
)

defineExpose<CollaborationPasswordFormExposed>({
  validate: () => passwordFormRef.value?.validate(),
})
</script>

<template>
  <ElForm
    ref="passwordFormRef"
    :model="form"
    :rules="props.rules"
    label-position="top"
    class="collaboration-password-form"
  >
    <ElFormItem :label="t('collaborationResolver.password')" prop="password">
      <ElInput
        v-model="form.password"
        type="password"
        show-password
        inputmode="numeric"
        :disabled="props.disabled"
        :maxlength="DOCUMENT_COLLABORATION_LINK_PASSWORD_LENGTH"
        :placeholder="t('collaborationResolver.passwordPlaceholder', { length: DOCUMENT_COLLABORATION_LINK_PASSWORD_LENGTH })"
        @keyup.enter="emit('submit')"
      />
    </ElFormItem>
  </ElForm>
</template>

<style scoped lang="scss">
.collaboration-password-form {
  min-width: 0;
}
</style>
