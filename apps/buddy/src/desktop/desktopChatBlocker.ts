import type { LocalBuddyServiceSupervisorState } from '../../electron/shared/localChatApi'

export type DesktopChatBlockerKind = 'runtime' | 'provider' | 'model'

export interface DesktopChatBlocker {
  dismissible: boolean
  kind: DesktopChatBlockerKind
}

interface ResolveDesktopChatBlockerInput {
  hasAvailableProvider: boolean
  hasSelectedModel: boolean
  runtimeError: string | null
  runtimeStatus: LocalBuddyServiceSupervisorState['status']
}

export function resolveDesktopChatBlocker(
  input: ResolveDesktopChatBlockerInput,
): DesktopChatBlocker | null {
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

export function reconcileDismissedDesktopChatBlocker(
  dismissedKind: DesktopChatBlockerKind | null,
  blocker: DesktopChatBlocker | null,
): DesktopChatBlockerKind | null {
  return blocker?.kind === dismissedKind ? dismissedKind : null
}
