import type { FormInstance, FormRules } from 'element-plus'
import type { Ref } from 'vue'
import { computed, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useFormSubmit } from '@/composables/useFormSubmit'
import { useAuthStore } from '@/stores/auth'
import { useUserStore } from '@/stores/user'
import { completeAuthNavigation } from '../../utils/navigation'
import {
  createConfirmPasswordRules,
  createDifferentPasswordRule,
  createPasswordRules,
  isValidPassword,
} from '../../utils/rules'

export function useChangePassword(options: {
  changePasswordFormRef: Ref<FormInstance | null>
}) {
  const router = useRouter()
  const authStore = useAuthStore()
  const userStore = useUserStore()
  const form = reactive({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const formRules: FormRules<typeof form> = {
    currentPassword: createPasswordRules('当前密码'),
    newPassword: [
      ...createPasswordRules('新密码'),
      createDifferentPasswordRule(() => form.currentPassword),
    ],
    confirmPassword: createConfirmPasswordRules(() => form.newPassword, '确认新密码', '两次输入的新密码不一致'),
  }

  const { isSubmitting, submit: submitChangePassword } = useFormSubmit({
    validate: () =>
      isValidPassword(form.currentPassword)
      && isValidPassword(form.newPassword)
      && form.confirmPassword === form.newPassword
      && form.currentPassword !== form.newPassword,
    action: () => authStore.updatePassword(form.currentPassword, form.newPassword),
    fallbackError: '修改密码失败',
    onSuccess: () => completeAuthNavigation(router, authStore),
  })

  const requiresPasswordChange = computed(() => userStore.requiresPasswordChange)
  const pageDescription = computed(() =>
    requiresPasswordChange.value ? '首次登录需要先设置新密码。' : '输入当前密码并设置新密码。',
  )

  async function handleSubmitChangePassword() {
    await submitChangePassword(options.changePasswordFormRef.value)
  }

  return {
    form,
    formRules,
    handleSubmitChangePassword,
    isSubmitting,
    pageDescription,
    requiresPasswordChange,
    submitChangePassword,
  }
}
