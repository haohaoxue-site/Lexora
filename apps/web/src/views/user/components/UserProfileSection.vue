<script setup lang="ts">
import type { FormInstance } from 'element-plus'
import type { UserProfileSectionEmits, UserProfileSectionProps } from '../typing'
import { CopyDocument } from '@element-plus/icons-vue'
import { useTemplateRef } from 'vue'
import EntityAvatar from '@/components/entity-avatar/EntityAvatar.vue'
import { useUserProfileSection } from '../composables/useUserProfileSection'
import UserSettingsSectionHeader from './UserSettingsSectionHeader.vue'

const props = defineProps<UserProfileSectionProps>()
const emit = defineEmits<UserProfileSectionEmits>()
const displayNameModel = defineModel<string>('displayName', { required: true })
const profileFormRef = useTemplateRef<FormInstance>('profileFormRef')
const fileInputRef = useTemplateRef<HTMLInputElement>('fileInputRef')
const {
  displayNameRules,
  form,
  handleCopyUserCode,
  handleFileChange,
  handlePickAvatar,
  handleSaveDisplayName,
  sectionDescription,
} = useUserProfileSection({
  displayName: displayNameModel,
  fileInputRef,
  onSaveDisplayName: () => emit('saveDisplayName'),
  onUpload: file => emit('upload', file),
  props,
  profileFormRef,
})
</script>

<template>
  <ElCard shadow="never" class="user-profile-section">
    <UserSettingsSectionHeader
      title="个人资料"
      :description="sectionDescription"
    >
      <template #aside>
        <div class="user-profile-section__collab-code">
          <span class="user-profile-section__collab-code-copy">
            <span class="user-profile-section__collab-code-label">协作码</span>
            <strong class="user-profile-section__collab-code-value">{{ props.userCode }}</strong>
          </span>
          <ElTooltip content="复制协作码" placement="top">
            <ElButton
              text
              circle
              type="primary"
              :icon="CopyDocument"
              aria-label="复制协作码"
              @click="handleCopyUserCode"
            />
          </ElTooltip>
        </div>
      </template>
    </UserSettingsSectionHeader>

    <div class="user-profile-section__hero">
      <EntityAvatar
        :name="form.displayName"
        :src="props.avatarUrl"
        :alt="`${form.displayName} 的头像`"
        :size="72"
        shape="circle"
        kind="user"
        class="user-profile-section__avatar"
      />

      <div class="user-profile-section__hero-actions">
        <ElButton :loading="props.isUploading" @click="handlePickAvatar">
          {{ props.isUploading ? '上传中...' : '更换头像' }}
        </ElButton>
        <p class="user-profile-section__hint">
          支持 JPG、PNG、WEBP，大小不超过 2MB。
        </p>
      </div>

      <input
        ref="fileInputRef"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        class="hidden"
        @change="handleFileChange"
      >
    </div>

    <ElForm
      ref="profileFormRef"
      :model="form"
      :rules="props.canEditDisplayName ? displayNameRules : undefined"
      label-position="top"
      class="user-profile-section__form"
      @submit.prevent="handleSaveDisplayName"
    >
      <ElFormItem label="显示名称" prop="displayName">
        <div class="user-profile-section__display-name-row w-full">
          <ElInput
            v-model="form.displayName"
            :readonly="!props.canEditDisplayName"
            maxlength="50"
            show-word-limit
          />
          <ElButton
            v-if="props.canEditDisplayName"
            type="primary"
            :loading="props.isSavingDisplayName"
            native-type="submit"
          >
            保存
          </ElButton>
        </div>
      </ElFormItem>
    </ElForm>
  </ElCard>
</template>

<style scoped lang="scss">
.user-profile-section {
  border-color: color-mix(in srgb, var(--brand-border-base) 85%, transparent);

  &__collab-code {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.5rem;
    min-width: 11.25rem;
    padding: 0.3125rem 0.5rem 0.3125rem 0.625rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 78%, transparent);
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--brand-fill-lighter) 72%, transparent);
  }

  &__collab-code-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.125rem;
  }

  &__collab-code-label {
    color: var(--brand-text-secondary);
    font-size: 0.625rem;
    line-height: 1;
  }

  &__collab-code-value {
    overflow: hidden;
    color: var(--brand-text-primary);
    font-size: 0.75rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
    line-height: 1.1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__hero {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.25rem;
    padding: 1rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 78%, transparent);
    border-radius: 1rem;
    background: color-mix(in srgb, var(--brand-fill-lighter) 72%, transparent);
  }

  &__avatar {
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand-border-base) 70%, transparent);
  }

  &__hero-actions {
    min-width: 0;
  }

  &__hint {
    margin: 0.5rem 0 0;
    color: var(--brand-text-secondary);
    font-size: 0.75rem;
  }

  &__form {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  &__display-name-row {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;

    :deep(.el-input) {
      flex: 1;
      min-width: 0;
    }

    :deep(.el-button) {
      flex-shrink: 0;
    }
  }

  @media (max-width: 640px) {
    &__collab-code {
      width: 100%;
      min-width: 0;
    }
  }
}
</style>
