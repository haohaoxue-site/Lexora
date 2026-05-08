<script setup lang="ts">
import { useTemplateRef } from 'vue'
import UserAccountSection from '../components/UserAccountSection.vue'
import UserDeleteSection from '../components/UserDeleteSection.vue'
import UserProfileSection from '../components/UserProfileSection.vue'
import { useUser } from '../composables/useUser'

const userAccountSectionRef = useTemplateRef<{ clearEmailValidation: () => void }>('userAccountSectionRef')
const {
  account,
  avatarUrl,
  bindingProvider,
  canDisconnectGithub,
  canDisconnectLinuxDo,
  canStartGithubBinding,
  canStartLinuxDoBinding,
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
  isSavingDisplayName,
  isSendingEmailCode,
  isUploadingAvatar,
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
  <div v-loading="isLoading" class="settings-user-page">
    <ElAlert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      :closable="false"
      class="settings-user-page__alert"
    />

    <div v-else class="settings-user-page__grid">
      <UserProfileSection
        v-model:display-name="profileForm.displayName"
        :avatar-url="avatarUrl"
        :user-code="account.userCode"
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
        :can-start-github-binding="canStartGithubBinding"
        :can-start-linux-do-binding="canStartLinuxDoBinding"
        @send-code="sendEmailCode"
        @confirm-email="handleConfirmEmail"
        @start-oauth-binding="connectOauth"
        @disconnect-oauth-binding="disconnectOauth"
      />
    </div>

    <UserDeleteSection
      v-if="shouldShowDeleteAccountSection"
      class="settings-user-page__danger"
      :is-deleting="isDeletingAccount"
      :confirmation-target="deleteAccountConfirmationTarget"
      :confirmation-mode="deleteAccountConfirmationMode"
      :confirmation-phrase="deleteAccountConfirmationPhrase"
      @delete-account="deleteAccount"
    />
  </div>
</template>

<style scoped lang="scss">
.settings-user-page {
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
