<script setup lang="ts">
import { computed } from 'vue'
import { useDocumentTree } from '../../composables/useDocumentTree'

const {
  closeDeleteDialog,
  confirmDeleteDocument,
  confirmPermanentlyDeleteDocument,
  deleteActionKind,
  deleteDialogDocumentTitle,
  isDeleteDialogOpen,
} = useDocumentTree()

const isSubmitting = computed(() => deleteActionKind.value !== null)
const isDeletingToTrash = computed(() => deleteActionKind.value === 'trash')
const isPermanentlyDeleting = computed(() => deleteActionKind.value === 'permanent')
const dialogTitle = computed(() => `是否删除：${deleteDialogDocumentTitle.value || '该文档'}？`)

function handleDialogVisibleChange(value: boolean) {
  if (value || isSubmitting.value) {
    return
  }

  closeDeleteDialog()
}

function handleDelete() {
  if (isSubmitting.value) {
    return
  }

  void confirmDeleteDocument()
}

function handlePermanentlyDelete() {
  if (isSubmitting.value) {
    return
  }

  void confirmPermanentlyDeleteDocument()
}
</script>

<template>
  <ElDialog
    class="document-delete-dialog"
    :model-value="isDeleteDialogOpen"
    :title="dialogTitle"
    width="30rem"
    align-center
    destroy-on-close
    :close-on-click-modal="false"
    :close-on-press-escape="!isSubmitting"
    :show-close="!isSubmitting"
    @update:model-value="handleDialogVisibleChange"
  >
    <div class="grid gap-2">
      <p class="m-0 text-sm leading-[1.6] text-main">
        删除后可在回收站中恢复，子文档会一并处理。
      </p>
    </div>

    <template #footer>
      <div class="flex items-center justify-between gap-3">
        <ElButton
          type="danger"
          :loading="isPermanentlyDeleting"
          :disabled="isSubmitting"
          @click="handlePermanentlyDelete"
        >
          彻底删除
        </ElButton>

        <div class="inline-flex items-center justify-end gap-3">
          <ElButton :disabled="isSubmitting" @click="closeDeleteDialog">
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
