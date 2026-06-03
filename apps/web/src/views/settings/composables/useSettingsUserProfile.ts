import { createSharedComposable } from '@vueuse/core'
import { computed, reactive, shallowRef } from 'vue'
import { useUserStore } from '@/stores/user'
import { ElMessage } from '@/utils/element-plus'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

export const useSettingsUserProfile = createSharedComposable(() => {
  const userStore = useUserStore()
  const isSavingDisplayName = shallowRef(false)
  const isUploadingAvatar = shallowRef(false)
  const profileForm = reactive({
    displayName: '',
  })

  const avatarUrl = computed(() =>
    userStore.settings?.profile.avatarUrl ?? userStore.currentUser?.avatarUrl ?? null,
  )
  const canEditDisplayName = computed(() => !userStore.isSystemAdmin)

  function syncProfileForm() {
    const nextSettings = userStore.settings

    if (!nextSettings) {
      return
    }

    profileForm.displayName = nextSettings.profile.displayName
  }

  async function saveDisplayName() {
    isSavingDisplayName.value = true

    try {
      await userStore.updateProfile(profileForm.displayName.trim())
      profileForm.displayName = userStore.currentUser?.displayName ?? profileForm.displayName
      ElMessage.success('显示名称已更新')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '保存显示名称失败'))
    }
    finally {
      isSavingDisplayName.value = false
    }
  }

  async function uploadAvatar(file: File) {
    isUploadingAvatar.value = true

    try {
      await userStore.updateAvatar(file)
      ElMessage.success('头像已更新')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '上传头像失败'))
    }
    finally {
      isUploadingAvatar.value = false
    }
  }

  return {
    avatarUrl,
    canEditDisplayName,
    isSavingDisplayName,
    isUploadingAvatar,
    profileForm,
    saveDisplayName,
    syncProfileForm,
    uploadAvatar,
  }
})
