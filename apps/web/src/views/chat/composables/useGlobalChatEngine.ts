import { CHAT_SESSION_ORIGIN } from '@haohaoxue/samepage-contracts'
import { createSharedComposable } from '@vueuse/core'
import { createChatEngine } from '@/composables/chat/createChatEngine'
import { useUiStore } from '@/stores/ui'
import { useChatRouteState } from './useChatRouteState'

export const useGlobalChatEngine = createSharedComposable(() => {
  const uiStore = useUiStore()

  return createChatEngine(CHAT_SESSION_ORIGIN.GLOBAL, {
    // 延迟解析，避免 useChatRouteState 与引擎初始化互相依赖。
    onSessionCreated: sessionId => useChatRouteState().navigateToSession(sessionId),
    persistence: {
      rememberActive: uiStore.setLastActiveChatSessionId,
      forgetActive: uiStore.clearLastActiveChatSessionId,
    },
  })
})
