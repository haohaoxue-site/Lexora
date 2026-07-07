export type BuddyShellSurface = 'chat' | 'panel'

export interface BuddyShellSurfacePlan {
  mountsChatRuntime: boolean
  mountsControlRuntime: boolean
}

export function resolveBuddyShellSurface(pathname: string): BuddyShellSurface {
  return pathname.startsWith('/chat') ? 'chat' : 'panel'
}

export function createBuddyShellSurfacePlan(surface: BuddyShellSurface): BuddyShellSurfacePlan {
  return {
    mountsChatRuntime: surface === 'chat',
    mountsControlRuntime: surface === 'panel',
  }
}
