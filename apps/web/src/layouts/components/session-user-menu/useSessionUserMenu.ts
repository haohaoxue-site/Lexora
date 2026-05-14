import type { AppearancePreference } from '@haohaoxue/samepage-contracts'
import type { WorkspaceCreateDialogSubmitPayload } from '../workspace-create-dialog/typing'
import type { SessionContextSwitchAction, SessionMenuUser } from './typing'
import {
  APPEARANCE_PREFERENCE_LABELS,
  APPEARANCE_PREFERENCE_VALUES,
  WORKSPACE_TYPE,
} from '@haohaoxue/samepage-contracts'
import { ElMessage } from 'element-plus'
import { computed, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { SvgIconCategory } from '@/components/svg-icon/typing'
import { useAuthSession } from '@/layouts/composables/useAuthSession'
import { getWorkspaceEntryPath } from '@/layouts/utils/workspace-entry'
import { ADMIN_ROUTE_NAME } from '@/router/constants'
import { useUserStore } from '@/stores/user'
import { useWorkspaceStore } from '@/stores/workspace'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

/**
 * 会话菜单组合参数。
 */
interface UseSessionUserMenuOptions {
  showContextSwitch: boolean
}

type SessionSubmenu = 'appearance' | 'workspace' | null

export function useSessionUserMenu(options: UseSessionUserMenuOptions) {
  const route = useRoute()
  const router = useRouter()
  const userStore = useUserStore()
  const workspaceStore = useWorkspaceStore()
  const menuVisible = shallowRef(false)
  const activeSubmenu = shallowRef<SessionSubmenu>(null)
  const teamSettingsDialogVisible = shallowRef(false)
  const workspaceCreateDialogVisible = shallowRef(false)
  const isCreatingWorkspace = shallowRef(false)
  const { currentUser: sessionUser, isLoggingOut, logout } = useAuthSession()
  // 登出过程中 sessionUser 会短暂为 null，保留上一份用于继续渲染头像/昵称。
  const lastKnownUser = shallowRef(sessionUser.value)

  const appearanceOptions = APPEARANCE_PREFERENCE_VALUES.map(value => ({
    label: APPEARANCE_PREFERENCE_LABELS[value],
    value,
  }))
  const appearanceMenuVisible = computed(() => activeSubmenu.value === 'appearance')
  const workspaceMenuVisible = computed(() => activeSubmenu.value === 'workspace')
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
  const currentWorkspaceLabel = computed(() => workspaceStore.currentWorkspaceLabel)
  const currentWorkspaceId = computed(() => workspaceStore.currentWorkspace?.id ?? '')
  const currentTeamWorkspace = computed(() =>
    workspaceStore.currentWorkspace?.type === WORKSPACE_TYPE.TEAM
      ? workspaceStore.currentWorkspace
      : null,
  )
  const switchableWorkspaces = computed(() => workspaceStore.switchableWorkspaces)

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
    workspaceMenuVisible,
    teamSettingsDialogVisible,
    workspaceCreateDialogVisible,
    isCreatingWorkspace,
    isLoggingOut,
    appearanceOptions,
    currentUser,
    contextSwitchAction,
    currentAppearance,
    currentAppearanceLabel,
    isSavingAppearance,
    currentWorkspaceLabel,
    currentWorkspaceId,
    currentTeamWorkspace,
    switchableWorkspaces,
    toggleAppearanceMenu,
    toggleWorkspaceMenu,
    openWorkspaceCreateDialog,
    openTeamSettingsDialog,
    handleAppearanceSelect,
    handleWorkspaceCreate,
    switchContext,
    handleLogout,
    handleWorkspaceSelect,
    getLogoutIconName,
  }

  function toggleAppearanceMenu() {
    if (isSavingAppearance.value) {
      return
    }

    toggleSubmenu('appearance')
  }

  function toggleWorkspaceMenu() {
    toggleSubmenu('workspace')
  }

  function toggleSubmenu(target: NonNullable<SessionSubmenu>) {
    activeSubmenu.value = activeSubmenu.value === target ? null : target
  }

  function closeMenu() {
    activeSubmenu.value = null
    menuVisible.value = false
  }

  function openWorkspaceCreateDialog() {
    workspaceCreateDialogVisible.value = true
    closeMenu()
  }

  function openTeamSettingsDialog() {
    if (!currentTeamWorkspace.value) {
      return
    }

    teamSettingsDialogVisible.value = true
    closeMenu()
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

  async function handleWorkspaceCreate(payload: WorkspaceCreateDialogSubmitPayload) {
    if (isCreatingWorkspace.value) {
      return
    }

    isCreatingWorkspace.value = true

    try {
      const createdWorkspace = await workspaceStore.createWorkspace({
        name: payload.name,
        description: payload.description,
      })
      let selectedWorkspace = createdWorkspace
      let iconUploadError: unknown = null

      if (payload.iconFile) {
        try {
          selectedWorkspace = await workspaceStore.uploadWorkspaceIcon(createdWorkspace.id, payload.iconFile)
        }
        catch (error) {
          iconUploadError = error
        }
      }

      workspaceStore.selectWorkspace(selectedWorkspace.id)
      workspaceCreateDialogVisible.value = false
      ElMessage.success('团队创建成功')

      if (iconUploadError) {
        ElMessage.warning(getRequestErrorDisplayMessage(iconUploadError, '团队已创建，但空间图标上传失败'))
      }
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '创建团队失败'))
    }
    finally {
      isCreatingWorkspace.value = false
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

  function handleWorkspaceSelect(workspaceId: string) {
    workspaceStore.selectWorkspace(workspaceId)
    closeMenu()
  }

  function getLogoutIconName() {
    return isLoggingOut.value
      ? 'spinner-orbit'
      : 'logout'
  }
}
