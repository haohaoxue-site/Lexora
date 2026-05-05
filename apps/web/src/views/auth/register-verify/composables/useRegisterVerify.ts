import type { FormInstance, FormRules } from 'element-plus'
import type { ShallowRef } from 'vue'
import { computed, onMounted, reactive, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useFormSubmit } from '@/composables/useFormSubmit'
import { useAuthStore } from '@/stores/auth'
import { completeAuthNavigation } from '../../utils/navigation'
import {
  createConfirmPasswordRules,
  createDisplayNameRules,
  createEmailRules,
  createPasswordRules,
  isValidDisplayName,
  isValidEmail,
  isValidPassword,
} from '../../utils/rules'

const EMAIL_VERIFICATION_CODE_RE = /^\d{6}$/

export function useRegisterVerify(options: { registerFormRef: ShallowRef<FormInstance | null> }) {
  const route = useRoute()
  const router = useRouter()
  const authStore = useAuthStore()
  const statusLabel = shallowRef('完成邮箱注册')
  const errorMessage = shallowRef('')
  const form = reactive({
    email: '',
    code: '',
    displayName: '',
    password: '',
    confirmPassword: '',
  })
  const formRules: FormRules<typeof form> = {
    email: createEmailRules('注册邮箱'),
    code: [
      {
        required: true,
        message: '请输入 6 位验证码',
      },
      {
        pattern: EMAIL_VERIFICATION_CODE_RE,
        message: '验证码需为 6 位数字',
      },
    ],
    displayName: createDisplayNameRules(),
    password: createPasswordRules(),
    confirmPassword: createConfirmPasswordRules(() => form.password),
  }

  const routeEmail = computed(() => typeof route.query.email === 'string' ? route.query.email.trim() : '')
  const isReady = computed(() => Boolean(form.email) && !errorMessage.value)
  const pageDescription = computed(() => {
    if (errorMessage.value) {
      return '注册信息无效，请重新填写邮箱后获取验证码。'
    }

    return '输入验证码并设置密码后即可完成注册。'
  })

  function initEmail() {
    if (!routeEmail.value || !isValidEmail(routeEmail.value)) {
      statusLabel.value = '注册信息无效'
      errorMessage.value = '缺少注册邮箱，请重新填写邮箱地址。'
      return
    }

    form.email = routeEmail.value
  }

  const { isSubmitting, submit: submitRegistration } = useFormSubmit({
    validate: () =>
      isReady.value
      && isValidEmail(form.email)
      && EMAIL_VERIFICATION_CODE_RE.test(form.code.trim())
      && isValidDisplayName(form.displayName.trim())
      && isValidPassword(form.password)
      && form.confirmPassword === form.password,
    action: async () => {
      form.displayName = form.displayName.trim()
      form.code = form.code.trim()
      await authStore.passwordRegister(form.email, form.code, form.displayName, form.password)
    },
    fallbackError: '注册失败',
    onSuccess: () => completeAuthNavigation(router, authStore),
  })

  onMounted(() => {
    initEmail()
  })

  async function handleSubmitRegistration() {
    await submitRegistration(options.registerFormRef.value)
  }

  return {
    errorMessage,
    form,
    formRules,
    handleSubmitRegistration,
    isReady,
    isSubmitting,
    pageDescription,
    statusLabel,
    submitRegistration,
  }
}
