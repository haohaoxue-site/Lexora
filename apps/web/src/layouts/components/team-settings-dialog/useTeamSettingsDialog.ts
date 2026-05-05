import type {
  TeamWorkspaceSummary,
  UserCollabIdentity,
  WorkspaceInviteSummary,
  WorkspaceMemberSummary,
} from '@haohaoxue/samepage-contracts'
import type { FormInstance, FormRules } from 'element-plus'
import type { Ref } from 'vue'
import { WORKSPACE_MEMBER_ROLE } from '@haohaoxue/samepage-contracts'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  computed,
  reactive,
  shallowRef,
  watch,
} from 'vue'
import {
  cancelWorkspaceInvite,
  createWorkspaceInvite,
  getPendingWorkspaceInvites,
  getWorkspaceMembers,
} from '@/apis/workspace'
import { useUserStore } from '@/stores/user'
import { useWorkspaceStore } from '@/stores/workspace'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

type TeamSettingsMemberItem = WorkspaceMemberSummary & {
  roleLabel: string
  joinedLabel: string
  isCurrentUser: boolean
}

type TeamSettingsPendingInviteItem = WorkspaceInviteSummary & {
  invitedLabel: string
}

/**
 * 团队设置弹窗参数。
 */
interface UseTeamSettingsDialogOptions {
  /**
   * 显示状态
   * @description 弹窗开关的单一真源。
   */
  visible: Ref<boolean>
  /**
   * 当前团队空间
   * @description 始终只管理当前选中的团队。
   */
  workspace: Ref<Readonly<TeamWorkspaceSummary> | null>
  /**
   * 邀请表单实例
   * @description 用于触发表单校验与重置。
   */
  inviteFormRef: Ref<FormInstance | null>
}

const WORKSPACE_MEMBER_ROLE_LABELS = {
  [WORKSPACE_MEMBER_ROLE.OWNER]: '所有者',
  [WORKSPACE_MEMBER_ROLE.ADMIN]: '管理员',
  [WORKSPACE_MEMBER_ROLE.MEMBER]: '成员',
} as const satisfies Record<(typeof WORKSPACE_MEMBER_ROLE)[keyof typeof WORKSPACE_MEMBER_ROLE], string>

export function useTeamSettingsDialog(options: UseTeamSettingsDialogOptions) {
  const userStore = useUserStore()
  const workspaceStore = useWorkspaceStore()
  const members = shallowRef<WorkspaceMemberSummary[]>([])
  const pendingInvites = shallowRef<WorkspaceInviteSummary[]>([])
  const isLoadingMembers = shallowRef(false)
  const isLoadingPendingInvites = shallowRef(false)
  const isCreatingInvite = shallowRef(false)
  const isDeletingWorkspace = shallowRef(false)
  const cancelingInviteId = shallowRef('')
  const memberLoadErrorMessage = shallowRef('')
  const pendingInviteErrorMessage = shallowRef('')
  const inviteForm = reactive({
    userCode: '',
  })
  const selectedInvitee = shallowRef<UserCollabIdentity | null>(null)
  let membersRequestId = 0
  let pendingInvitesRequestId = 0

  const dialogTitle = computed(() => options.workspace.value?.name
    ? `团队设置 · ${options.workspace.value.name}`
    : '团队设置')
  const currentUserId = computed(() => userStore.currentUser?.id ?? '')
  const isOwner = computed(() => options.workspace.value?.role === WORKSPACE_MEMBER_ROLE.OWNER)
  const roleSummaryLabel = computed(() => {
    const role = options.workspace.value?.role

    if (role === WORKSPACE_MEMBER_ROLE.OWNER) {
      return '你是当前团队的所有者'
    }

    if (role === WORKSPACE_MEMBER_ROLE.ADMIN) {
      return '你是当前团队的管理员'
    }

    return '你是当前团队成员'
  })
  const memberItems = computed<TeamSettingsMemberItem[]>(() =>
    [...members.value]
      .sort((left, right) => {
        const leftOwnerWeight = Number(left.role === WORKSPACE_MEMBER_ROLE.OWNER)
        const rightOwnerWeight = Number(right.role === WORKSPACE_MEMBER_ROLE.OWNER)

        if (leftOwnerWeight !== rightOwnerWeight) {
          return rightOwnerWeight - leftOwnerWeight
        }

        const leftCurrentUserWeight = Number(left.user.id === currentUserId.value)
        const rightCurrentUserWeight = Number(right.user.id === currentUserId.value)

        if (leftCurrentUserWeight !== rightCurrentUserWeight) {
          return rightCurrentUserWeight - leftCurrentUserWeight
        }

        return Date.parse(left.joinedAt ?? left.createdAt) - Date.parse(right.joinedAt ?? right.createdAt)
      })
      .map(member => ({
        ...member,
        roleLabel: WORKSPACE_MEMBER_ROLE_LABELS[member.role],
        joinedLabel: formatJoinedLabel(member),
        isCurrentUser: member.user.id === currentUserId.value,
      })),
  )
  const pendingInviteItems = computed<TeamSettingsPendingInviteItem[]>(() =>
    [...pendingInvites.value]
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .map(invite => ({
        ...invite,
        invitedLabel: formatInviteLabel(invite),
      })),
  )
  const memberCountLabel = computed(() => `${memberItems.value.length} 名成员`)
  const pendingInviteCountLabel = computed(() => `${pendingInviteItems.value.length} 个待处理邀请`)
  const inviteRules = computed<FormRules>(() => ({
    userCode: [
      {
        required: true,
        message: '请输入完整协作码',
        trigger: 'blur',
      },
      {
        validator: (_rule, value, callback) => {
          const normalizedValue = typeof value === 'string' ? value.trim() : ''

          if (!normalizedValue) {
            callback()
            return
          }

          if (!selectedInvitee.value) {
            callback(new Error('请先查找并确认要邀请的成员'))
            return
          }

          callback()
        },
        trigger: ['change', 'blur'],
      },
    ],
  }))

  watch(
    [options.visible, options.workspace],
    async ([visible, workspace], previousState) => {
      const [previousVisible, previousWorkspace] = previousState ?? []
      const workspaceChanged = workspace?.id !== previousWorkspace?.id

      if (!workspace) {
        options.visible.value = false
        resetMemberState()
        resetPendingInviteState()
        return
      }

      if (!visible) {
        return
      }

      if (!workspaceChanged && visible === previousVisible) {
        return
      }

      await loadDialogData()
    },
    { immediate: true },
  )

  watch(options.visible, (visible) => {
    if (visible) {
      return
    }

    resetInviteForm()
  })

  async function loadDialogData() {
    if (!isOwner.value) {
      resetPendingInviteState()
      await loadMembers()
      return
    }

    await Promise.all([
      loadMembers(),
      loadPendingInvites(),
    ])
  }

  async function loadMembers() {
    const workspaceId = options.workspace.value?.id

    if (!workspaceId) {
      resetMemberState()
      return
    }

    const requestId = ++membersRequestId

    isLoadingMembers.value = true
    memberLoadErrorMessage.value = ''
    members.value = []

    try {
      const nextMembers = await getWorkspaceMembers(workspaceId)

      if (requestId !== membersRequestId) {
        return
      }

      members.value = nextMembers
    }
    catch (error) {
      if (requestId !== membersRequestId) {
        return
      }

      memberLoadErrorMessage.value = getRequestErrorDisplayMessage(error, '加载团队成员失败')
    }
    finally {
      if (requestId === membersRequestId) {
        isLoadingMembers.value = false
      }
    }
  }

  async function loadPendingInvites() {
    const workspaceId = options.workspace.value?.id

    if (!workspaceId || !isOwner.value) {
      resetPendingInviteState()
      return
    }

    const requestId = ++pendingInvitesRequestId

    isLoadingPendingInvites.value = true
    pendingInviteErrorMessage.value = ''
    pendingInvites.value = []

    try {
      const nextPendingInvites = await getPendingWorkspaceInvites(workspaceId)

      if (requestId !== pendingInvitesRequestId) {
        return
      }

      pendingInvites.value = nextPendingInvites
    }
    catch (error) {
      if (requestId !== pendingInvitesRequestId) {
        return
      }

      pendingInviteErrorMessage.value = getRequestErrorDisplayMessage(error, '加载待处理邀请失败')
    }
    finally {
      if (requestId === pendingInvitesRequestId) {
        isLoadingPendingInvites.value = false
      }
    }
  }

  function resetMemberState() {
    membersRequestId += 1
    members.value = []
    isLoadingMembers.value = false
    memberLoadErrorMessage.value = ''
  }

  function resetPendingInviteState() {
    pendingInvitesRequestId += 1
    pendingInvites.value = []
    isLoadingPendingInvites.value = false
    cancelingInviteId.value = ''
    pendingInviteErrorMessage.value = ''
  }

  function handleInviteResolved(user: UserCollabIdentity) {
    selectedInvitee.value = user
    void options.inviteFormRef.value?.validateField('userCode').catch(() => false)
  }

  function handleInviteCleared() {
    selectedInvitee.value = null

    if (!inviteForm.userCode.trim()) {
      options.inviteFormRef.value?.clearValidate('userCode')
      return
    }

    void options.inviteFormRef.value?.validateField('userCode').catch(() => false)
  }

  function resetInviteForm() {
    inviteForm.userCode = ''
    selectedInvitee.value = null
    options.inviteFormRef.value?.clearValidate()
  }

  async function submitInvite() {
    const workspaceId = options.workspace.value?.id

    if (!workspaceId || !isOwner.value || isCreatingInvite.value) {
      return
    }

    const isValid = await options.inviteFormRef.value?.validate().catch(() => false)

    if (isValid === false || !selectedInvitee.value) {
      return
    }

    isCreatingInvite.value = true

    try {
      await createWorkspaceInvite(workspaceId, {
        userCode: selectedInvitee.value.userCode,
      })
      ElMessage.success(`已向 ${selectedInvitee.value.displayName} 发送团队邀请`)
      resetInviteForm()
      await loadPendingInvites()
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '发送团队邀请失败'))
    }
    finally {
      isCreatingInvite.value = false
    }
  }

  async function cancelInvite(invite: WorkspaceInviteSummary) {
    const workspaceId = options.workspace.value?.id

    if (!workspaceId || !isOwner.value || cancelingInviteId.value) {
      return
    }

    cancelingInviteId.value = invite.id

    try {
      await cancelWorkspaceInvite(workspaceId, invite.id)
      ElMessage.success(`已取消发给 ${invite.invitee.displayName} 的团队邀请`)
      await loadPendingInvites()
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '取消团队邀请失败'))
    }
    finally {
      if (cancelingInviteId.value === invite.id) {
        cancelingInviteId.value = ''
      }
    }
  }

  async function deleteCurrentWorkspace() {
    const workspace = options.workspace.value

    if (!workspace || !isOwner.value || isDeletingWorkspace.value) {
      return
    }

    const confirmed = await ElMessageBox.confirm(
      `将永久删除团队「${workspace.name}」，其文档、成员、邀请与分享关系都会一并清理。`,
      '删除团队',
      {
        type: 'warning',
        confirmButtonText: '删除团队',
        cancelButtonText: '取消',
      },
    ).then(() => true).catch(() => false)

    if (!confirmed) {
      return
    }

    isDeletingWorkspace.value = true

    try {
      await workspaceStore.deleteWorkspace(workspace.id)
      ElMessage.success('团队已删除')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '删除团队失败'))
    }
    finally {
      isDeletingWorkspace.value = false
    }
  }

  return {
    cancelInvite,
    cancelingInviteId,
    deleteCurrentWorkspace,
    dialogTitle,
    inviteForm,
    inviteRules,
    isCreatingInvite,
    isDeletingWorkspace,
    isLoadingMembers,
    isLoadingPendingInvites,
    isOwner,
    memberLoadErrorMessage,
    memberCountLabel,
    memberItems,
    loadPendingInvites,
    pendingInviteCountLabel,
    pendingInviteErrorMessage,
    pendingInviteItems,
    roleSummaryLabel,
    loadMembers,
    handleInviteCleared,
    handleInviteResolved,
    resetInviteForm,
    submitInvite,
  }
}

function formatJoinedLabel(member: WorkspaceMemberSummary) {
  return `加入于 ${dayjs(member.joinedAt ?? member.createdAt).format('YYYY-MM-DD HH:mm')}`
}

function formatInviteLabel(invite: WorkspaceInviteSummary) {
  return `已发送于 ${dayjs(invite.createdAt).format('YYYY-MM-DD HH:mm')}`
}
