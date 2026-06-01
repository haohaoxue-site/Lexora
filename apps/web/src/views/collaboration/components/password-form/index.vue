<script setup lang="ts">
import type { FormInstance } from 'element-plus'
import type {
  CollaborationPasswordFormEmits,
  CollaborationPasswordFormExposed,
  CollaborationPasswordFormProps,
} from './typing'
import { DOCUMENT_COLLABORATION_LINK_PASSWORD_LENGTH } from '@haohaoxue/samepage-contracts'
import { reactive, useTemplateRef, watch } from 'vue'

const props = defineProps<CollaborationPasswordFormProps>()
const emit = defineEmits<CollaborationPasswordFormEmits>()
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
    <ElFormItem label="链接密码" prop="password">
      <ElInput
        v-model="form.password"
        type="password"
        show-password
        inputmode="numeric"
        :disabled="props.disabled"
        :maxlength="DOCUMENT_COLLABORATION_LINK_PASSWORD_LENGTH"
        :placeholder="`请输入 ${DOCUMENT_COLLABORATION_LINK_PASSWORD_LENGTH} 位协作链接密码`"
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
