import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { Ref } from 'vue'
import type { TaskCapability } from './contracts'
import type { DesktopBrowserGuestSurfaceHost } from '@/platform/browser/browserGuestSurface'
import { createInjectionContext } from '@/shared/composables/createInjectionContext'

export interface TaskContext {
  appSidebarCollapsed: Readonly<Ref<boolean>>
  browser: LexoraDesktopApi['browser']
  browserGuests: DesktopBrowserGuestSurfaceHost
  clipboard: LexoraDesktopApi['clipboard']
  notificationTargetMessageId: Readonly<Ref<string | null>>
  tasks: TaskCapability
  toggleAppSidebar: () => void
}

export const { key: taskContextKey, useContext: useTaskContext }
  = createInjectionContext<TaskContext>('Task')
