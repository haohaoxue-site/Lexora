import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type {
  LocalBuddyServiceSupervisorState,
  LocalContextUsageSnapshot,
  LocalRunEvent,
  LocalRuntimeModelOption,
} from '@buddy-electron/shared/localChatApi'
import type { BuddyApprovalPolicy } from '@buddy-shared/approvalPolicy'
import type { BuddyExecutionProfile } from '@buddy-shared/executionProfile'
import type { BuddyServiceTier, BuddyThinkingLevel } from '@buddy-shared/modelSelection'
import type { Ref } from 'vue'
import { computed, shallowRef, watch } from 'vue'
import { createChatContextUsage } from '@/workbenches/chat/composer/chatContextUsage'

interface UseChatContextUsageOptions {
  activeBranchId: Readonly<Ref<string | null>>
  activeConversationId: Readonly<Ref<string | null>>
  approvalPolicy: Readonly<Ref<BuddyApprovalPolicy>>
  api: LexoraDesktopApi['localChat']['context']
  draftId: Readonly<Ref<string>>
  executionProfile: Readonly<Ref<BuddyExecutionProfile>>
  models: Readonly<Ref<ReadonlyArray<LocalRuntimeModelOption>>>
  spaceId: Readonly<Ref<string | null>>
  runSignalEvents: Readonly<Ref<ReadonlyArray<LocalRunEvent>>>
  runtimeState: Readonly<Ref<LocalBuddyServiceSupervisorState>>
  selectedEffort: Readonly<Ref<BuddyThinkingLevel | null>>
  selectedModel: Readonly<Ref<LocalRuntimeModelOption | null>>
  selectedServiceTier: Readonly<Ref<BuddyServiceTier | null>>
}

export function useChatContextUsage(options: UseChatContextUsageOptions) {
  const snapshot = shallowRef<LocalContextUsageSnapshot | null>(null)
  let requestId = 0

  const contextUsage = computed(() => createChatContextUsage({
    events: options.runSignalEvents.value,
    models: options.models.value,
    selectedModel: options.selectedModel.value,
    snapshot: snapshot.value,
  }))
  const stopRefreshWatch = watch(
    () => [
      options.runtimeState.value.status,
      options.selectedModel.value?.providerId ?? null,
      options.selectedModel.value?.modelId ?? null,
      options.selectedEffort.value,
      options.selectedServiceTier.value,
      options.activeConversationId.value,
      options.activeBranchId.value,
      options.spaceId.value,
      options.approvalPolicy.value,
      options.executionProfile.value,
      options.draftId.value,
    ] as const,
    () => void refresh(),
    { immediate: true },
  )

  async function refresh() {
    const currentRequestId = ++requestId
    const selectedModel = options.selectedModel.value
    const conversationId = options.activeConversationId.value
    const branchId = options.activeBranchId.value
    if (
      options.runtimeState.value.status !== 'ready'
      || !selectedModel
      || ((conversationId === null) !== (branchId === null))
    ) {
      snapshot.value = null
      return
    }

    snapshot.value = null
    try {
      const nextSnapshot = await options.api.getUsageSnapshot({
        approvalPolicy: options.approvalPolicy.value,
        branchId,
        conversationId,
        draftId: options.draftId.value,
        executionProfile: options.executionProfile.value,
        modelSelection: {
          modelId: selectedModel.modelId,
          providerId: selectedModel.providerId,
          reasoning: options.selectedEffort.value,
          serviceTier: options.selectedServiceTier.value,
        },
        spaceId: options.spaceId.value,
      })
      if (currentRequestId === requestId)
        snapshot.value = nextSnapshot
    }
    catch {
      if (currentRequestId === requestId)
        snapshot.value = null
    }
  }

  function dispose() {
    requestId += 1
    stopRefreshWatch()
  }

  return {
    contextUsage,
    dispose,
    refresh,
  }
}
