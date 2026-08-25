import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { InjectionKey, ShallowRef } from 'vue'
import type { DesktopCapabilities } from '@/app/desktopCapabilities'
import type { useDesktopShellState } from '@/shell/useDesktopShellState'
import { inject } from 'vue'

export interface DesktopAppContext {
  capabilities: DesktopCapabilities
  clipboard: LexoraDesktopApi['clipboard']
  notificationTargetMessageId: Readonly<ShallowRef<string | null>>
  ready: Promise<void>
  shell: ReturnType<typeof useDesktopShellState>
  toggleAppSidebar: () => void
}

export const desktopAppContextKey: InjectionKey<DesktopAppContext>
  = Symbol('desktop-app-context')

export function useDesktopApp(): DesktopAppContext {
  const context = inject(desktopAppContextKey)
  if (!context)
    throw new Error('Desktop app context is unavailable')
  return context
}
