<script setup lang="ts">
import type { FormInstance } from 'element-plus'
import type { UserProfileSectionEmits, UserProfileSectionProps } from './typing'
import { useTemplateRef } from 'vue'
import CopyStateIcon from '@/components/copy-state-icon/CopyStateIcon.vue'
import EntityAvatar from '@/components/entity-avatar'
import { useUserProfileSection } from '../../composables/useUserProfileSection'
import UserSettingsSectionHeader from '../section-header'

const props = defineProps<UserProfileSectionProps>()
const emit = defineEmits<UserProfileSectionEmits>()
const displayNameModel = defineModel<string>('displayName', { required: true })
const profileFormRef = useTemplateRef<FormInstance>('profileFormRef')
const fileInputRef = useTemplateRef<HTMLInputElement>('fileInputRef')
const {
  copiedUserCode,
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
        <div class="user-profile-section__collab-code grid min-w-[11.25rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 py-[0.3125rem] pl-[0.625rem] max-[640px]:w-full max-[640px]:min-w-0">
          <span class="flex min-w-0 flex-col gap-[0.125rem]">
            <span class="text-[0.625rem] leading-none text-secondary">协作码</span>
            <strong class="truncate font-mono text-xs leading-[1.1] text-main">{{ props.userCode }}</strong>
          </span>
          <ElTooltip content="复制协作码" placement="top">
            <ElButton
              text
              circle
              :type="copiedUserCode ? 'success' : 'primary'"
              class="user-profile-section__copy-button"
              :aria-label="copiedUserCode ? '协作码已复制' : '复制协作码'"
              @click="handleCopyUserCode"
            >
              <CopyStateIcon :copied="copiedUserCode" />
            </ElButton>
          </ElTooltip>
        </div>
      </template>
    </UserSettingsSectionHeader>

    <div class="user-profile-section__hero mb-5 flex flex-wrap items-center gap-4 rounded-[1rem] p-4">
      <EntityAvatar
        :name="form.displayName"
        :src="props.avatarUrl"
        :alt="`${form.displayName} 的头像`"
        :size="72"
        shape="circle"
        kind="user"
        class="user-profile-section__avatar"
      />

      <div class="min-w-0">
        <ElButton :loading="props.isUploading" @click="handlePickAvatar">
          {{ props.isUploading ? '上传中...' : '更换头像' }}
        </ElButton>
        <p class="mt-2 text-xs text-secondary">
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
      class="flex flex-col gap-1"
      @submit.prevent="handleSaveDisplayName"
    >
      <ElFormItem label="显示名称" prop="displayName">
        <div class="user-profile-section__display-name-row flex w-full items-start gap-3">
          <ElInput
            v-model="form.displayName"
            class="min-w-0 flex-1"
            :readonly="!props.canEditDisplayName"
            maxlength="50"
            show-word-limit
          />
          <ElButton
            v-if="props.canEditDisplayName"
            type="primary"
            class="shrink-0"
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
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 78%, transparent);
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--brand-fill-lighter) 72%, transparent);
  }

  &__copy-button {
    transition:
      color 0.16s ease,
      background-color 0.16s ease,
      transform 0.16s ease;

    &.el-button--success {
      transform: translateY(-0.0625rem);
    }
  }

  &__hero {
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 78%, transparent);
    border-radius: 1rem;
    background: color-mix(in srgb, var(--brand-fill-lighter) 72%, transparent);
  }

  &__avatar {
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand-border-base) 70%, transparent);
  }
}
</style>
