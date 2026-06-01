<script setup lang="ts">
import type { UserAccountSectionExposed } from './typing'
import { nextTick, onMounted, shallowRef, useTemplateRef } from 'vue'
import { useUserStore } from '@/stores/user'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import UserAccountSection from '../../components/user-account-section'
import UserDeleteSection from '../../components/user-delete-section'
import UserProfileSection from '../../components/user-profile-section'
import { useSettingsAuthCapabilities } from '../../composables/useSettingsAuthCapabilities'
import { useSettingsUserAccount } from '../../composables/useSettingsUserAccount'
import { useSettingsUserDelete } from '../../composables/useSettingsUserDelete'
import { useSettingsUserProfile } from '../../composables/useSettingsUserProfile'

const userStore = useUserStore()
const userAccountSectionRef = useTemplateRef<UserAccountSectionExposed>('userAccountSectionRef')

const { loadAuthCapabilities } = useSettingsAuthCapabilities()
const {
  avatarUrl,
  canEditDisplayName,
  isSavingDisplayName,
  isUploadingAvatar,
  profileForm,
  saveDisplayName,
  syncProfileForm,
  uploadAvatar,
} = useSettingsUserProfile()
const {
  account,
  bindEmail,
  bindingProvider,
  connectOauth,
  consumeRouteFeedback,
  disconnectOauth,
  disconnectingProvider,
  emailBindingEnabled,
  emailForm,
  isBindingEmail,
  isSendingEmailCode,
  oauthProviderBindingState,
  sendEmailCode,
  syncEmailForm,
} = useSettingsUserAccount()
const {
  deleteAccount,
  deleteAccountConfirmationMode,
  deleteAccountConfirmationPhrase,
  deleteAccountConfirmationTarget,
  isDeletingAccount,
  shouldShowDeleteAccountSection,
} = useSettingsUserDelete()

const isLoading = shallowRef(false)
const errorMessage = shallowRef('')

onMounted(loadView)

async function loadView() {
  isLoading.value = true
  errorMessage.value = ''

  try {
    await Promise.all([
      userStore.refreshContext(),
      loadAuthCapabilities(),
    ])

    syncProfileForm()
    syncEmailForm()
    await consumeRouteFeedback()
  }
  catch (error) {
    errorMessage.value = getRequestErrorDisplayMessage(error, '加载用户设置失败')
  }
  finally {
    isLoading.value = false
  }
}

async function handleConfirmEmail() {
  const isSuccess = await bindEmail()

  if (!isSuccess) {
    return
  }

  await nextTick()
  userAccountSectionRef.value?.clearEmailValidation()
}
</script>

<template>
  <div v-loading="isLoading" class="settings-user-page mx-auto max-w-6xl p-6">
    <ElAlert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      :closable="false"
      class="mb-4"
    />

    <div v-else class="grid gap-4">
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
        :oauth-provider-binding-state="oauthProviderBindingState"
        @send-code="sendEmailCode"
        @confirm-email="handleConfirmEmail"
        @start-oauth-binding="connectOauth"
        @disconnect-oauth-binding="disconnectOauth"
      />
    </div>

    <UserDeleteSection
      v-if="shouldShowDeleteAccountSection"
      class="mt-4"
      :is-deleting="isDeletingAccount"
      :confirmation-target="deleteAccountConfirmationTarget"
      :confirmation-mode="deleteAccountConfirmationMode"
      :confirmation-phrase="deleteAccountConfirmationPhrase"
      @delete-account="deleteAccount"
    />
  </div>
</template>
