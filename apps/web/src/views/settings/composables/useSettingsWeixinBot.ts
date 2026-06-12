import type {
  WeixinBotBindingStatus,
  WeixinBotLoginStartResponse,
  WeixinBotLoginStatusResponse,
} from '@/apis/bot-accounts'
import {
  BOT_RUNTIME_STATE,
  WEIXIN_BOT_LOGIN_STATUS,
} from '@haohaoxue/samepage-contracts/bot'
import { CHAT_SESSION_CHANNEL } from '@haohaoxue/samepage-contracts/chat/constants'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import {
  disconnectWeixinBot,
  getWeixinBotLoginStatus,
  getWeixinBotStatus,
  startWeixinBot,
  startWeixinBotLogin,
  stopWeixinBot,
  submitWeixinBotVerifyCode,
} from '@/apis/bot-accounts'
import { ElMessage, ElMessageBox } from '@/utils/element-plus'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

type WeixinLoginState = WeixinBotLoginStartResponse | WeixinBotLoginStatusResponse

const LOGIN_POLL_DELAY_MS = 800

function createDefaultStatus(): WeixinBotBindingStatus {
  return {
    channel: CHAT_SESSION_CHANNEL.WEIXIN_BOT,
    bound: false,
    accountId: null,
    externalUserId: null,
    runtimeState: BOT_RUNTIME_STATE.NOT_BOUND,
    lastError: null,
    lastLog: null,
    lastStartedAt: null,
    lastStoppedAt: null,
    lastInboundAt: null,
    lastOutboundAt: null,
    updatedAt: null,
  }
}

export function useSettingsWeixinBot() {
  const status = shallowRef<WeixinBotBindingStatus>(createDefaultStatus())
  const loginState = shallowRef<WeixinLoginState | null>(null)
  const loginDialogVisible = shallowRef(false)
  const verifyCode = shallowRef('')
  const isLoading = shallowRef(false)
  const isStartingLogin = shallowRef(false)
  const isPollingLogin = shallowRef(false)
  const isSubmittingVerifyCode = shallowRef(false)
  const isStartingBot = shallowRef(false)
  const isStoppingBot = shallowRef(false)
  const isDisconnecting = shallowRef(false)
  let pollTimer: ReturnType<typeof setTimeout> | null = null

  const isLoginTerminal = computed(() =>
    loginState.value?.status === WEIXIN_BOT_LOGIN_STATUS.CONFIRMED
    || loginState.value?.status === WEIXIN_BOT_LOGIN_STATUS.EXPIRED
    || loginState.value?.status === WEIXIN_BOT_LOGIN_STATUS.ERROR,
  )

  watch(loginDialogVisible, (visible) => {
    if (!visible) {
      clearLoginPoll()
    }
  })

  onScopeDispose(clearLoginPoll)

  async function loadWeixinStatus(options: { silent?: boolean } = {}) {
    isLoading.value = true

    try {
      status.value = await getWeixinBotStatus()
    }
    catch (error) {
      if (!options.silent) {
        ElMessage.error(getRequestErrorDisplayMessage(error, '加载微信 Bot 状态失败'))
      }
    }
    finally {
      isLoading.value = false
    }
  }

  async function startLogin() {
    isStartingLogin.value = true
    clearLoginPoll()

    try {
      loginState.value = await startWeixinBotLogin()
      verifyCode.value = ''
      loginDialogVisible.value = true
      scheduleLoginPoll()
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '发起微信扫码绑定失败'))
    }
    finally {
      isStartingLogin.value = false
    }
  }

  async function pollLoginStatus() {
    const loginId = loginState.value?.loginId
    if (!loginId || isLoginTerminal.value || !loginDialogVisible.value) {
      return
    }

    isPollingLogin.value = true

    try {
      const nextState = await getWeixinBotLoginStatus(loginId)
      applyLoginState(nextState)

      if (!isLoginTerminal.value) {
        scheduleLoginPoll()
      }
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '刷新微信扫码状态失败'))
      scheduleLoginPoll(2500)
    }
    finally {
      isPollingLogin.value = false
    }
  }

  async function submitVerifyCode() {
    const loginId = loginState.value?.loginId
    const code = verifyCode.value.trim()
    if (!loginId || !code) {
      ElMessage.warning('请输入验证码')
      return
    }

    isSubmittingVerifyCode.value = true

    try {
      const nextState = await submitWeixinBotVerifyCode(loginId, {
        verifyCode: code,
      })
      applyLoginState(nextState)
      if (!isLoginTerminal.value) {
        scheduleLoginPoll()
      }
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '提交验证码失败'))
    }
    finally {
      isSubmittingVerifyCode.value = false
    }
  }

  async function startRuntime() {
    isStartingBot.value = true

    try {
      status.value = await startWeixinBot()
      ElMessage.success('微信 Bot 已启动')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '启动微信 Bot 失败'))
    }
    finally {
      isStartingBot.value = false
    }
  }

  async function stopRuntime() {
    isStoppingBot.value = true

    try {
      status.value = await stopWeixinBot()
      ElMessage.success('微信 Bot 已停止')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '停止微信 Bot 失败'))
    }
    finally {
      isStoppingBot.value = false
    }
  }

  async function disconnect() {
    const confirmed = await ElMessageBox.confirm(
      '解绑后将停止接收新的微信消息，历史对话仍保留在对话列表中。',
      '解绑微信 Bot',
      {
        type: 'warning',
        confirmButtonText: '解绑',
        cancelButtonText: '取消',
      },
    ).then(() => true).catch(() => false)

    if (!confirmed) {
      return
    }

    isDisconnecting.value = true

    try {
      await disconnectWeixinBot()
      status.value = createDefaultStatus()
      ElMessage.success('微信 Bot 已解绑')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '解绑微信 Bot 失败'))
    }
    finally {
      isDisconnecting.value = false
    }
  }

  function applyLoginState(nextState: WeixinLoginState) {
    loginState.value = loginState.value ? { ...loginState.value, ...nextState } : nextState

    if ('account' in nextState && nextState.account) {
      status.value = nextState.account
    }

    if (nextState.status === WEIXIN_BOT_LOGIN_STATUS.CONFIRMED) {
      ElMessage.success('微信 Bot 已绑定')
      clearLoginPoll()
      loginDialogVisible.value = false
    }
  }

  function scheduleLoginPoll(delay = LOGIN_POLL_DELAY_MS) {
    clearLoginPoll()
    pollTimer = setTimeout(() => {
      pollTimer = null
      void pollLoginStatus()
    }, delay)
  }

  function clearLoginPoll() {
    if (!pollTimer) {
      return
    }

    clearTimeout(pollTimer)
    pollTimer = null
  }

  return {
    disconnect,
    isDisconnecting,
    isLoading,
    isPollingLogin,
    isStartingBot,
    isStartingLogin,
    isStoppingBot,
    isSubmittingVerifyCode,
    loadWeixinStatus,
    loginDialogVisible,
    loginState,
    startLogin,
    startRuntime,
    status,
    stopRuntime,
    submitVerifyCode,
    verifyCode,
  }
}
