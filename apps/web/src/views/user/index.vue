<script setup lang="ts">
import { useTemplateRef } from 'vue'
import WorkspacePage from '@/layouts/components/WorkspacePage.vue'
import UserAccountSection from './components/UserAccountSection.vue'
import UserDeleteSection from './components/UserDeleteSection.vue'
import UserPreferenceSection from './components/UserPreferenceSection.vue'
import UserProfileSection from './components/UserProfileSection.vue'
import { useUser } from './composables/useUser'

const userAccountSectionRef = useTemplateRef<{ clearEmailValidation: () => void }>('userAccountSectionRef')
const {
  account,
  avatarUrl,
  appearancePreference,
  bindingProvider,
  canDisconnectGithub,
  canDisconnectLinuxDo,
  deleteAccount,
  deleteAccountConfirmationMode,
  deleteAccountConfirmationPhrase,
  deleteAccountConfirmationTarget,
  disconnectingProvider,
  emailBindingEnabled,
  emailForm,
  errorMessage,
  isBindingEmail,
  isDeletingAccount,
  isLoading,
  isSavingLanguage,
  isSavingAppearance,
  isSavingDisplayName,
  isSendingEmailCode,
  isUploadingAvatar,
  languagePreference,
  profileForm,
  handleConfirmEmail,
  saveDisplayName,
  sendEmailCode,
  shouldShowDeleteAccountSection,
  canEditDisplayName,
  connectOauth,
  disconnectOauth,
  uploadAvatar,
} = useUser({
  userAccountSectionRef,
})
</script>

<template>
  <WorkspacePage>
    <template #context>
      <div class="user-settings-context">
        <div>
          <div class="user-settings-context__title">
            个人设置
          </div>
          <p class="user-settings-context__description">
            在这里管理资料、登录方式与个人偏好。
          </p>
        </div>
      </div>
    </template>

    <div v-loading="isLoading" class="user-settings-view">
      <ElAlert
        v-if="errorMessage"
        :title="errorMessage"
        type="error"
        show-icon
        :closable="false"
        class="user-settings-view__alert"
      />

      <div v-else class="user-settings-view__grid">
        <UserProfileSection
          v-model:display-name="profileForm.displayName"
          :avatar-url="avatarUrl"
          :can-edit-display-name="canEditDisplayName"
          :is-saving-display-name="isSavingDisplayName"
          :is-uploading="isUploadingAvatar"
          @save-display-name="saveDisplayName"
          @upload="uploadAvatar"
        />

        <UserAccountSection
          ref="userAccountSectionRef"
          v-model:email="emailForm.email"
          v-model:code="emailForm.code"
          v-model:new-password="emailForm.newPassword"
          v-model:confirm-password="emailForm.confirmPassword"
          :account="account"
          :email-binding-enabled="emailBindingEnabled"
          :is-sending-code="isSendingEmailCode"
          :is-binding-email="isBindingEmail"
          :binding-provider="bindingProvider"
          :disconnecting-provider="disconnectingProvider"
          :can-disconnect-github="canDisconnectGithub"
          :can-disconnect-linux-do="canDisconnectLinuxDo"
          @send-code="sendEmailCode"
          @confirm-email="handleConfirmEmail"
          @start-oauth-binding="connectOauth"
          @disconnect-oauth-binding="disconnectOauth"
        />

        <UserPreferenceSection
          v-model:language="languagePreference"
          v-model:appearance="appearancePreference"
          :is-saving-language="isSavingLanguage"
          :is-saving-appearance="isSavingAppearance"
        />
      </div>

      <UserDeleteSection
        v-if="shouldShowDeleteAccountSection"
        class="user-settings-view__danger"
        :is-deleting="isDeletingAccount"
        :confirmation-target="deleteAccountConfirmationTarget"
        :confirmation-mode="deleteAccountConfirmationMode"
        :confirmation-phrase="deleteAccountConfirmationPhrase"
        @delete-account="deleteAccount"
      />
    </div>
  </WorkspacePage>
</template>

<style scoped lang="scss">
.user-settings-context {
  min-width: 0;

  &__title {
    color: var(--brand-text-primary);
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: -0.025em;
    line-height: 2rem;
  }

  &__description {
    margin: 0.375rem 0 0;
    color: var(--brand-text-secondary);
    font-size: 0.875rem;
  }
}

.user-settings-view {
  max-width: 72rem;
  margin-inline: auto;
  padding: 1.5rem;

  &__alert {
    margin-bottom: 1rem;
  }

  &__grid {
    display: grid;
    gap: 1rem;
  }

  &__danger {
    margin-top: 1rem;
  }
}
</style>
