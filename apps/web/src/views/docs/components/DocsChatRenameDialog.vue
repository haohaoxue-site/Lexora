<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'

const props = defineProps<{
  loading: boolean
  modelValue: boolean
  title: string
}>()

const emits = defineEmits<{
  'update:modelValue': [value: boolean]
  'confirm': [title: string]
}>()

const draft = shallowRef('')
const canSubmit = computed(() => Boolean(draft.value.trim()) && !props.loading)

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      draft.value = props.title
    }
  },
)

function submit() {
  if (!canSubmit.value) {
    return
  }

  emits('confirm', draft.value)
}
</script>

<template>
  <ElDialog
    :model-value="props.modelValue"
    title="重命名对话"
    width="360px"
    destroy-on-close
    @update:model-value="emits('update:modelValue', $event)"
    @keyup.enter="submit"
  >
    <ElInput
      v-model="draft"
      maxlength="120"
      show-word-limit
      placeholder="输入对话名称"
      :disabled="props.loading"
      autofocus
    />

    <template #footer>
      <ElButton @click="emits('update:modelValue', false)">
        取消
      </ElButton>
      <ElButton
        type="primary"
        :loading="props.loading"
        :disabled="!canSubmit"
        @click="submit"
      >
        保存
      </ElButton>
    </template>
  </ElDialog>
</template>
