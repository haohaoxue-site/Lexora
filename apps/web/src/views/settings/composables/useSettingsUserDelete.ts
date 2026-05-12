import type { DeleteCurrentUserRequest } from '@haohaoxue/samepage-contracts'
import {
  ACCOUNT_DELETION_CONFIRMATION_PHRASE,
  PERMISSIONS,
} from '@haohaoxue/samepage-contracts'
import { createSharedComposable } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { computed, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { deleteCurrentUser } from '@/apis/user'
import { resetAdminRoutes } from '@/router'
import { useAuthStore } from '@/stores/auth'
import { useUserStore } from '@/stores/user'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import { useSettingsUserAccount } from './useSettingsUserAccount'

export const DELETE_ACCOUNT_CONFIRMATION_PHRASE: DeleteCurrentUserRequest['confirmationPhrase']
  = ACCOUNT_DELETION_CONFIRMATION_PHRASE

export const useSettingsUserDelete = createSharedComposable(() => {
  const router = useRouter()
  const authStore = useAuthStore()
  const userStore = useUserStore()
  const { account } = useSettingsUserAccount()
  const isDeletingAccount = shallowRef(false)

  const currentUser = computed(() => userStore.currentUser)
  const canDeleteAccount = computed(() =>
    currentUser.value?.permissions.includes(PERMISSIONS.USER_DELETE_SELF) ?? false,
  )
  const shouldShowDeleteAccountSection = computed(() =>
    canDeleteAccount.value && !userStore.isSystemAdmin,
  )
  const deleteAccountConfirmationMode = computed<'email' | 'displayName'>(() =>
    account.value.email ? 'email' : 'displayName',
  )
  const deleteAccountConfirmationTarget = computed(() =>
    account.value.email ?? currentUser.value?.displayName ?? '',
  )

  async function deleteAccount(payload: DeleteCurrentUserRequest) {
    if (!shouldShowDeleteAccountSection.value) {
      return false
    }

    isDeletingAccount.value = true

    try {
      await deleteCurrentUser(payload)
      authStore.clearSession()
      ElMessage.success('账号已删除')

      try {
        await router.replace({ name: 'login' })
      }
      finally {
        resetAdminRoutes(router)
      }

      return true
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '删除账号失败'))
      return false
    }
    finally {
      isDeletingAccount.value = false
    }
  }

  return {
    deleteAccount,
    deleteAccountConfirmationMode,
    deleteAccountConfirmationPhrase: DELETE_ACCOUNT_CONFIRMATION_PHRASE,
    deleteAccountConfirmationTarget,
    isDeletingAccount,
    shouldShowDeleteAccountSection,
  }
})
