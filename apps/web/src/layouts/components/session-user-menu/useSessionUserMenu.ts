import type { AppearancePreference } from '@haohaoxue/samepage-contracts'
import type { SessionContextSwitchAction, SessionMenuUser } from './typing'
import {
  APPEARANCE_PREFERENCE_LABELS,
  APPEARANCE_PREFERENCE_VALUES,
} from '@haohaoxue/samepage-contracts'
import { ElMessage } from 'element-plus'
import { computed, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { SvgIconCategory } from '@/components/svg-icon/typing'
import { useAuthSession } from '@/layouts/composables/useAuthSession'
import { getWorkspaceEntryPath } from '@/layouts/utils/workspace-entry'
import { ADMIN_ROUTE_NAME } from '@/router/constants'
import { useUserStore } from '@/stores/user'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

/**
 * 会话菜单组合参数。
 */
interface UseSessionUserMenuOptions {
  showContextSwitch: boolean
}

type SessionSubmenu = 'appearance' | null

export function useSessionUserMenu(options: UseSessionUserMenuOptions) {
  const route = useRoute()
  const router = useRouter()
  const userStore = useUserStore()
  const menuVisible = shallowRef(false)
  const activeSubmenu = shallowRef<SessionSubmenu>(null)
  const { currentUser: sessionUser, isLoggingOut, logout } = useAuthSession()
  // 登出过程中 sessionUser 会短暂为 null，保留上一份用于继续渲染头像/昵称。
  const lastKnownUser = shallowRef(sessionUser.value)

  const appearanceOptions = APPEARANCE_PREFERENCE_VALUES.map(value => ({
    label: APPEARANCE_PREFERENCE_LABELS[value],
    value,
  }))
  const appearanceMenuVisible = computed(() => activeSubmenu.value === 'appearance')
  const currentUser = computed<SessionMenuUser>(() => {
    const user = sessionUser.value ?? lastKnownUser.value!

    return {
      displayName: user.displayName,
      email: user.email ?? '',
      avatarUrl: user.avatarUrl,
    }
  })
  const isAdminRoute = computed(() => Boolean(route.meta?.requiresSystemAdmin))
  const contextSwitchAction = computed<SessionContextSwitchAction | null>(() => {
    if (!options.showContextSwitch) {
      return null
    }

    if (isAdminRoute.value) {
      return {
        label: '进入工作区',
        iconCategory: SvgIconCategory.UI,
        icon: 'arrow-left',
      }
    }

    if (userStore.isSystemAdmin) {
      return {
        label: '进入管理区',
        iconCategory: SvgIconCategory.UI,
        icon: 'user-admin',
      }
    }

    return null
  })
  const currentAppearance = computed(() => userStore.preferences.appearance)
  const currentAppearanceLabel = computed(() => APPEARANCE_PREFERENCE_LABELS[currentAppearance.value])
  const isSavingAppearance = computed(() => userStore.isSavingAppearance)

  watch(sessionUser, (user) => {
    if (user) {
      lastKnownUser.value = user
    }
  })

  watch(menuVisible, (visible) => {
    if (!visible) {
      activeSubmenu.value = null
    }
  })

  return {
    menuVisible,
    appearanceMenuVisible,
    isLoggingOut,
    appearanceOptions,
    currentUser,
    contextSwitchAction,
    currentAppearance,
    currentAppearanceLabel,
    isSavingAppearance,
    toggleAppearanceMenu,
    handleAppearanceSelect,
    switchContext,
    handleLogout,
    getLogoutIconName,
  }

  function toggleAppearanceMenu() {
    if (isSavingAppearance.value) {
      return
    }

    toggleSubmenu('appearance')
  }

  function toggleSubmenu(target: NonNullable<SessionSubmenu>) {
    activeSubmenu.value = activeSubmenu.value === target ? null : target
  }

  function closeMenu() {
    activeSubmenu.value = null
    menuVisible.value = false
  }

  async function handleAppearanceSelect(mode: AppearancePreference) {
    if (isSavingAppearance.value || currentAppearance.value === mode) {
      return
    }

    try {
      await userStore.updateAppearancePreference(mode)
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '保存外观偏好失败'))
    }
  }

  async function switchContext() {
    closeMenu()

    if (isAdminRoute.value) {
      await router.push(getWorkspaceEntryPath())
      return
    }

    await router.push({ name: ADMIN_ROUTE_NAME })
  }

  async function handleLogout() {
    closeMenu()
    await logout()
  }

  function getLogoutIconName() {
    return isLoggingOut.value
      ? 'spinner-orbit'
      : 'logout'
  }
}
