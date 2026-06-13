import type { CollabAwarenessState } from '@haohaoxue/lexora-contracts'

interface CollabAwarenessUserSource {
  id: string
  displayName: string
  avatarUrl: string | null
}

export function createCollabAwarenessState(
  user: CollabAwarenessUserSource | null | undefined,
): CollabAwarenessState | null {
  if (!user) {
    return null
  }

  return {
    user: {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    },
  }
}
