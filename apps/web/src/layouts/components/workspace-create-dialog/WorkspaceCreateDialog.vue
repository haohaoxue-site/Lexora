<script setup lang="ts">
import type { FormInstance } from 'element-plus'
import type {
  WorkspaceCreateDialogEmits,
  WorkspaceCreateDialogProps,
} from './typing'
import { WORKSPACE_DESCRIPTION_MAX_LENGTH, WORKSPACE_NAME_MAX_LENGTH } from '@haohaoxue/samepage-contracts'
import { computed, useTemplateRef } from 'vue'
import EntityAvatar from '@/components/entity-avatar/EntityAvatar.vue'
import { SvgIconCategory } from '@/components/svg-icon/typing'
import { useWorkspaceCreateDialog } from './useWorkspaceCreateDialog'

const props = defineProps<WorkspaceCreateDialogProps>()
const emit = defineEmits<WorkspaceCreateDialogEmits>()
const visible = defineModel<boolean>({ required: true })
const workspaceFormRef = useTemplateRef<FormInstance>('workspaceFormRef')
const fileInputRef = useTemplateRef<HTMLInputElement>('fileInputRef')
const {
  clearIcon,
  form,
  formRules,
  handleClose,
  handleIconChange,
  handlePickIcon,
  handleSubmit,
  iconAccept,
  previewName,
  resetForm,
} = useWorkspaceCreateDialog({
  isSubmitting: computed(() => props.isSubmitting),
  onSubmit: payload => emit('submit', payload),
  dialogVisible: visible,
  fileInputRef,
  workspaceFormRef,
})
</script>

<template>
  <ElDialog
    v-model="visible"
    title="创建团队"
    width="32rem"
    align-center
    append-to-body
    modal-append-to-body
    destroy-on-close
    @closed="resetForm"
  >
    <div class="workspace-create-dialog">
      <div class="workspace-create-dialog__header">
        <button
          type="button"
          class="workspace-create-dialog__icon-picker"
          :class="{ 'is-disabled': props.isSubmitting }"
          :disabled="props.isSubmitting"
          @click="handlePickIcon"
        >
          <EntityAvatar
            v-if="form.iconPreviewUrl"
            :name="previewName"
            :src="form.iconPreviewUrl"
            :alt="`${previewName} 的图标`"
            :size="96"
            shape="rounded"
            kind="workspace"
            class="workspace-create-dialog__avatar"
          />

          <span v-else class="workspace-create-dialog__icon-placeholder">
            <span class="workspace-create-dialog__icon-placeholder-glyph-shell">
              <SvgIcon
                :category="SvgIconCategory.UI"
                icon="plus"
                size="18px"
                class="workspace-create-dialog__icon-placeholder-glyph"
              />
            </span>
            <span class="workspace-create-dialog__icon-placeholder-label">
              上传图标
            </span>
          </span>
        </button>

        <div class="workspace-create-dialog__header-copy">
          <p class="workspace-create-dialog__title">
            团队图标
          </p>
          <p class="workspace-create-dialog__description">
            点击左侧图标区域上传，支持 JPG、PNG、WEBP，大小不超过 2MB。
          </p>
          <div class="workspace-create-dialog__meta">
            <span class="workspace-create-dialog__hint">
              {{ form.iconFile ? '已选择图标，点击左侧可重新上传。' : '未上传时将使用默认团队图标。' }}
            </span>
            <button
              v-if="form.iconFile"
              type="button"
              class="workspace-create-dialog__clear"
              :disabled="props.isSubmitting"
              @click="clearIcon"
            >
              移除
            </button>
          </div>
        </div>

        <input
          ref="fileInputRef"
          type="file"
          :accept="iconAccept"
          class="hidden"
          @change="handleIconChange"
        >
      </div>

      <ElForm
        ref="workspaceFormRef"
        :model="form"
        :rules="formRules"
        label-position="top"
        class="workspace-create-dialog__form"
        @submit.prevent="handleSubmit"
      >
        <ElFormItem label="空间名称" prop="name">
          <ElInput
            v-model="form.name"
            :maxlength="WORKSPACE_NAME_MAX_LENGTH"
            :disabled="props.isSubmitting"
            placeholder="例如：产品团队"
            show-word-limit
          />
        </ElFormItem>

        <ElFormItem label="空间描述" prop="description">
          <ElInput
            v-model="form.description"
            type="textarea"
            :maxlength="WORKSPACE_DESCRIPTION_MAX_LENGTH"
            :disabled="props.isSubmitting"
            :rows="3"
            placeholder="可选，用一句话说明这个团队空间"
            show-word-limit
          />
        </ElFormItem>
      </ElForm>
    </div>

    <template #footer>
      <div class="workspace-create-dialog__footer">
        <ElButton :disabled="props.isSubmitting" @click="handleClose">
          取消
        </ElButton>
        <ElButton type="primary" :loading="props.isSubmitting" @click="handleSubmit">
          {{ props.isSubmitting ? '创建中...' : '创建团队' }}
        </ElButton>
      </div>
    </template>
  </ElDialog>
</template>

<style scoped lang="scss">
.workspace-create-dialog {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;

  &__header {
    display: flex;
    align-items: flex-start;
    gap: 1.125rem;
    padding: 1.125rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 74%, transparent);
    border-radius: 1rem;
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--brand-fill-lighter) 76%, white 24%),
        color-mix(in srgb, var(--brand-fill-lighter) 42%, transparent)
      );
  }

  &__avatar {
    display: block;
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand-border-base) 70%, transparent);
  }

  &__icon-picker {
    display: flex;
    width: 96px;
    height: 96px;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border-radius: 1rem;
    border: 1px dashed color-mix(in srgb, var(--brand-border-base) 82%, transparent);
    background: color-mix(in srgb, var(--brand-bg-surface) 94%, white 6%);
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, white 72%, transparent),
      0 0 0 1px color-mix(in srgb, var(--brand-border-base) 58%, transparent);
    cursor: pointer;
    color: var(--brand-text-secondary);
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease,
      transform 0.2s ease,
      box-shadow 0.2s ease;

    &:hover:not(.is-disabled) {
      background: color-mix(in srgb, var(--brand-primary) 3%, var(--brand-bg-surface));
      border-color: color-mix(in srgb, var(--brand-primary) 20%, transparent);
      box-shadow:
        inset 0 1px 0 color-mix(in srgb, white 72%, transparent),
        0 0 0 1px color-mix(in srgb, var(--brand-primary) 10%, transparent);
      transform: translateY(-1px);
    }

    &:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--brand-primary) 26%, transparent);
      outline-offset: 2px;
    }

    &.is-disabled {
      cursor: not-allowed;
      opacity: 0.72;
      transform: none;
    }
  }

  &__icon-placeholder {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  &__icon-placeholder-glyph-shell {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 9999px;
    background: color-mix(in srgb, var(--brand-fill-light) 72%, var(--brand-bg-surface-raised));
    color: color-mix(in srgb, var(--brand-text-primary) 72%, var(--brand-primary) 28%);
  }

  &__icon-placeholder-glyph {
    display: block;
  }

  &__icon-placeholder-label {
    color: var(--brand-text-secondary);
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1;
  }

  &__header-copy {
    min-width: 0;
    flex: 1 1 0%;
  }

  &__title,
  &__description,
  &__hint {
    margin: 0;
  }

  &__title {
    color: var(--brand-text-primary);
    font-size: 0.9375rem;
    font-weight: 600;
  }

  &__description {
    margin-top: 0.375rem;
    color: var(--brand-text-secondary);
    font-size: 0.8125rem;
    line-height: 1.5;
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.875rem;
  }

  &__hint {
    color: var(--brand-text-tertiary);
    font-size: 0.75rem;
    line-height: 1.5;
  }

  &__clear {
    appearance: none;
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--brand-primary);
    cursor: pointer;
    font: inherit;
    font-size: 0.75rem;
    font-weight: 500;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
  }

  &__form {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  &__footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
  }

  @media (max-width: 640px) {
    &__header {
      flex-direction: column;
    }
  }
}
</style>
