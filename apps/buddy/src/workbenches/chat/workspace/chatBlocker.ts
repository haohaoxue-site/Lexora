import type { LocalBuddyServiceSupervisorState } from '@buddy-electron/shared/localChatApi'

export type ChatBlockerKind = 'runtime' | 'provider' | 'model'

export interface ChatBlocker {
  dismissible: boolean
  kind: ChatBlockerKind
}

interface ResolveChatBlockerInput {
  hasAvailableProvider: boolean
  hasSelectedModel: boolean
  runtimeError: string | null
  runtimeStatus: LocalBuddyServiceSupervisorState['status']
}

export function resolveChatBlocker(
  input: ResolveChatBlockerInput,
): ChatBlocker | null {
  if (input.runtimeError || input.runtimeStatus === 'offline')
    return { dismissible: false, kind: 'runtime' }
  if (input.runtimeStatus !== 'ready')
    return null
  if (!input.hasAvailableProvider)
    return { dismissible: true, kind: 'provider' }
  if (!input.hasSelectedModel)
    return { dismissible: true, kind: 'model' }
  return null
}

export function reconcileDismissedChatBlocker(
  dismissedKind: ChatBlockerKind | null,
  blocker: ChatBlocker | null,
): ChatBlockerKind | null {
  return blocker?.kind === dismissedKind ? dismissedKind : null
}
