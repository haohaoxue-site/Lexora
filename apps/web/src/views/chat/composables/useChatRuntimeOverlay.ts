import type { ChatMutationResponse, ChatSessionDetail, ChatSessionEvent } from '@/apis/chat'
import { createSharedComposable } from '@vueuse/core'
import { computed, shallowRef, watch } from 'vue'
import {
  applyChatRuntimeOverlayEvent,
  createChatRuntimeOverlayState,
  getChatRuntimeOverlayCancelRunId,
  getChatRuntimeOverlayCurrentRun,
  getChatRuntimeOverlayCursor,
  getChatRuntimeOverlayIsStreaming,
  mergeChatRenderSession,
  seedChatRuntimeOverlayFromMutationResponse,
  seedChatRuntimeOverlayFromSnapshot,
} from '../utils/chat-runtime-overlay'
import { useChatSessions } from './useChatSessions'

export const useChatRuntimeOverlay = createSharedComposable(() => {
  const { activeSession, activeSessionId } = useChatSessions()
  const overlayState = createChatRuntimeOverlayState()
  const overlayVersion = shallowRef(0)

  const renderSession = computed<ChatSessionDetail | null>(() => {
    trackOverlayVersion()
    return activeSession.value
      ? mergeChatRenderSession(activeSession.value, overlayState)
      : null
  })
  const currentRun = computed(() => {
    trackOverlayVersion()
    return activeSessionId.value
      ? getChatRuntimeOverlayCurrentRun(overlayState, activeSessionId.value)
      : null
  })
  const cancelRunId = computed(() => {
    trackOverlayVersion()
    return getChatRuntimeOverlayCancelRunId(overlayState, activeSessionId.value)
  })
  const isStreaming = computed(() => {
    trackOverlayVersion()
    return getChatRuntimeOverlayIsStreaming(overlayState, activeSessionId.value)
  })
  const activeCursor = computed(() => {
    trackOverlayVersion()
    return activeSessionId.value
      ? getChatRuntimeOverlayCursor(overlayState, activeSessionId.value)
      : null
  })

  watch(activeSession, (session) => {
    if (session) {
      if (seedChatRuntimeOverlayFromSnapshot(overlayState, session)) {
        touch()
      }
      return
    }

    touch()
  }, { immediate: true })

  function seedFromMutationResponse(response: ChatMutationResponse): void {
    seedChatRuntimeOverlayFromMutationResponse(overlayState, response)
    touch()
  }

  function applyEvent(event: ChatSessionEvent): boolean {
    const changed = applyChatRuntimeOverlayEvent(overlayState, event)
    if (changed) {
      touch()
    }
    return changed
  }

  function touch(): void {
    overlayVersion.value += 1
  }

  function trackOverlayVersion(): number {
    return overlayVersion.value
  }

  return {
    activeCursor,
    applyEvent,
    cancelRunId,
    currentRun,
    isStreaming,
    renderSession,
    seedFromMutationResponse,
  }
})
