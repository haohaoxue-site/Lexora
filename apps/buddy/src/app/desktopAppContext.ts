import type { DesktopAppInfo } from '@buddy-electron/shared/desktopApi'
import type { Ref } from 'vue'
import type { useDesktopLifecycle } from './bootstrap/useDesktopLifecycle'
import type { DesktopNavigation } from './bootstrap/useDesktopNavigation'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { NotificationCenterStore } from '@/modules/notifications'
import type { TaskIndex } from '@/modules/tasks/contracts'
import { createInjectionContext } from '@/shared/composables/createInjectionContext'

export interface DesktopAppContext {
  lifecycle: ReturnType<typeof useDesktopLifecycle>
  appInfo: Readonly<Ref<DesktopAppInfo | null>>
  appSidebarCollapsed: Readonly<Ref<boolean>>
  language: Readonly<Ref<BuddyLocale>>
  navigation: Pick<DesktopNavigation, 'navigate' | 'openNotification' | 'openSpace' | 'openTask'>
  notifications: Pick<NotificationCenterStore, 'items' | 'isLoading' | 'unseenCount' | 'load' | 'markAllSeen'>
  taskIndex: Pick<TaskIndex, 'spaces' | 'tasks'>
  toggleAppSidebar: () => void
}

export const { key: desktopAppContextKey, useContext: useDesktopApp }
  = createInjectionContext<DesktopAppContext>('Desktop app')
