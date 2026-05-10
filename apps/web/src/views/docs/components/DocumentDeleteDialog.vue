<script setup lang="ts">
import type { DocumentDeleteDialogEmits, DocumentDeleteDialogProps } from '../typing'
import { computed } from 'vue'

const props = defineProps<DocumentDeleteDialogProps>()
const emits = defineEmits<DocumentDeleteDialogEmits>()

const isSubmitting = computed(() => props.actionKind !== null)
const isDeletingToTrash = computed(() => props.actionKind === 'trash')
const isPermanentlyDeleting = computed(() => props.actionKind === 'permanent')
const dialogTitle = computed(() => `是否删除：${props.documentTitle || '该文档'}？`)

function closeDialog() {
  if (isSubmitting.value) {
    return
  }

  emits('update:modelValue', false)
}

function handleDialogVisibleChange(value: boolean) {
  if (value) {
    emits('update:modelValue', true)
    return
  }

  closeDialog()
}

function handleDelete() {
  if (isSubmitting.value) {
    return
  }

  emits('delete')
}

function handlePermanentlyDelete() {
  if (isSubmitting.value) {
    return
  }

  emits('permanentlyDelete')
}
</script>

<template>
  <ElDialog
    :model-value="props.modelValue"
    :title="dialogTitle"
    width="30rem"
    align-center
    destroy-on-close
    :close-on-click-modal="false"
    :close-on-press-escape="!isSubmitting"
    :show-close="!isSubmitting"
    @update:model-value="handleDialogVisibleChange"
  >
    <div class="document-delete-dialog__body">
      <p class="document-delete-dialog__description">
        删除后可在回收站中恢复，子文档会一并处理。
      </p>
    </div>

    <template #footer>
      <div class="document-delete-dialog__footer">
        <ElButton
          type="danger"
          :loading="isPermanentlyDeleting"
          :disabled="isSubmitting"
          @click="handlePermanentlyDelete"
        >
          彻底删除
        </ElButton>

        <div class="document-delete-dialog__footer-actions">
          <ElButton :disabled="isSubmitting" @click="closeDialog">
            取消
          </ElButton>
          <ElButton
            type="primary"
            :loading="isDeletingToTrash"
            :disabled="isSubmitting"
            @click="handleDelete"
          >
            删除
          </ElButton>
        </div>
      </div>
    </template>
  </ElDialog>
</template>

<style scoped lang="scss">
.document-delete-dialog__body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.document-delete-dialog__description {
  margin: 0;
  color: var(--brand-text-primary);
  font-size: 14px;
  line-height: 1.6;
}

.document-delete-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.document-delete-dialog__footer-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
}
</style>
