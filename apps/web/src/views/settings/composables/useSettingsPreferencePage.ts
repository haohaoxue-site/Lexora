import type { AppearancePreference, LanguagePreference } from '@haohaoxue/samepage-contracts'
import { ElMessage } from 'element-plus'
import { computed, onMounted, shallowRef } from 'vue'
import { useUserStore } from '@/stores/user'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

export function useSettingsPreferencePage() {
  const userStore = useUserStore()
  const errorMessage = shallowRef('')
  const isLoading = shallowRef(false)
  const isSavingLanguage = computed(() => userStore.isSavingLanguage)
  const isSavingAppearance = computed(() => userStore.isSavingAppearance)
  const languagePreference = computed<LanguagePreference>({
    get: () => userStore.preferences.language,
    set: (value) => {
      void saveLanguagePreference(value)
    },
  })
  const appearancePreference = computed<AppearancePreference>({
    get: () => userStore.preferences.appearance,
    set: (value) => {
      void saveAppearancePreference(value)
    },
  })

  onMounted(() => {
    void loadPage()
  })

  async function loadPage() {
    isLoading.value = true
    errorMessage.value = ''

    try {
      await userStore.refreshSettings()
    }
    catch (error) {
      errorMessage.value = getRequestErrorDisplayMessage(error, '加载偏好设置失败')
    }
    finally {
      isLoading.value = false
    }
  }

  async function saveLanguagePreference(value: LanguagePreference) {
    try {
      await userStore.updateLanguagePreference(value)
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '保存语言偏好失败'))
    }
  }

  async function saveAppearancePreference(value: AppearancePreference) {
    try {
      await userStore.updateAppearancePreference(value)
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '保存外观偏好失败'))
    }
  }

  return {
    appearancePreference,
    errorMessage,
    isLoading,
    isSavingAppearance,
    isSavingLanguage,
    languagePreference,
  }
}
