import type { FormInstance, FormRules } from 'element-plus'
import type { ShallowRef } from 'vue'
import { AUTH_METHOD } from '@haohaoxue/samepage-contracts'
import { ElMessage } from 'element-plus'
import { onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { createRegistrationInviteGrant, requestEmailVerification } from '@/apis/auth'
import { useFormSubmit } from '@/composables/useFormSubmit'
import { useAuthCapabilities } from '../../composables/useAuthCapabilities'
import { clearPasswordRegistrationInviteGrant, savePasswordRegistrationInviteGrant } from '../../utils/registration-invite'
import { createEmailRules, isValidEmail } from '../../utils/rules'

export function useRegister(options: { registerRequestFormRef: ShallowRef<FormInstance | null> }) {
  const router = useRouter()
  const form = reactive({
    email: '',
    inviteCode: '',
  })
  const formRules: FormRules<typeof form> = {
    email: createEmailRules(),
    inviteCode: [
      {
        required: true,
        message: '请输入邀请码',
      },
      {
        min: 4,
        message: '邀请码至少 4 位',
      },
    ],
  }
  const {
    isLoadingCapabilities,
    loadErrorMessage,
    loadCapabilities,
    passwordRegistrationInviteCodeRequired,
    passwordRegistrationEnabled,
  } = useAuthCapabilities()

  const { isSubmitting, submit: submitEmailVerificationRequest } = useFormSubmit({
    validate: () =>
      passwordRegistrationEnabled.value
      && isValidEmail(form.email.trim())
      && (!passwordRegistrationInviteCodeRequired.value || Boolean(form.inviteCode.trim())),
    action: async () => {
      form.email = form.email.trim()
      form.inviteCode = form.inviteCode.trim()
      const registrationInviteGrantToken = passwordRegistrationInviteCodeRequired.value
        ? await createPasswordRegistrationInviteGrant()
        : undefined

      await requestEmailVerification({
        email: form.email,
        registrationInviteGrantToken,
      })

      if (registrationInviteGrantToken) {
        savePasswordRegistrationInviteGrant({
          email: form.email,
          token: registrationInviteGrantToken,
        })
      }
      else {
        clearPasswordRegistrationInviteGrant()
      }

      ElMessage.success('验证码已发送，请查收邮箱')
      await router.push({
        name: 'register-verify',
        query: {
          email: form.email,
        },
      })
    },
    fallbackError: '发送验证码失败',
  })

  onMounted(() => {
    void loadCapabilities()
  })

  async function handleSubmitEmailVerificationRequest() {
    await submitEmailVerificationRequest(options.registerRequestFormRef.value)
  }

  return {
    form,
    formRules,
    handleSubmitEmailVerificationRequest,
    isLoadingCapabilities,
    isSubmitting,
    loadErrorMessage,
    passwordRegistrationInviteCodeRequired,
    passwordRegistrationEnabled,
    submitEmailVerificationRequest,
  }

  async function createPasswordRegistrationInviteGrant() {
    const grant = await createRegistrationInviteGrant({
      method: AUTH_METHOD.PASSWORD,
      email: form.email,
      inviteCode: form.inviteCode,
    })

    return grant.grantToken
  }
}
