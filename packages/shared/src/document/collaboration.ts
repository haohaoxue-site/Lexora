import type {
  DocumentCollaborationPermission,
  DocumentCollaborationScope,
  WorkspaceMemberRole,
  WorkspaceType,
} from '@haohaoxue/samepage-contracts'
import {
  DOCUMENT_COLLABORATION_PERMISSION,
  DOCUMENT_COLLABORATION_SCOPE,
  WORKSPACE_MEMBER_ROLE,
  WORKSPACE_TYPE,
} from '@haohaoxue/samepage-contracts'

/**
 * 文档协作能力矩阵。
 */
export interface DocumentCollaborationCapabilities {
  /** 是否可读 */
  canRead: boolean
  /** 是否可编辑正文 */
  canEdit: boolean
  /** 是否可创建子页面 */
  canCreateChild: boolean
  /** 是否可管理协作者 */
  canManageCollaboration: boolean
  /** 是否可发布外部站点 */
  canPublish: boolean
  /** 是否可移动文档 */
  canMove: boolean
  /** 是否可移入回收站 */
  canTrash: boolean
  /** 是否可从回收站恢复 */
  canRestore: boolean
}

const DOCUMENT_COLLABORATION_PERMISSION_CAPABILITIES: Record<DocumentCollaborationPermission, Omit<DocumentCollaborationCapabilities, 'canCreateChild'>> = {
  [DOCUMENT_COLLABORATION_PERMISSION.READ]: {
    canRead: true,
    canEdit: false,
    canManageCollaboration: false,
    canPublish: false,
    canMove: false,
    canTrash: false,
    canRestore: false,
  },
  [DOCUMENT_COLLABORATION_PERMISSION.EDIT]: {
    canRead: true,
    canEdit: true,
    canManageCollaboration: false,
    canPublish: false,
    canMove: false,
    canTrash: false,
    canRestore: false,
  },
}

export function getDocumentCollaborationCapabilities(
  input: {
    permission: DocumentCollaborationPermission
    scope: DocumentCollaborationScope
  },
): DocumentCollaborationCapabilities {
  const capabilities = DOCUMENT_COLLABORATION_PERMISSION_CAPABILITIES[input.permission]

  return {
    ...capabilities,
    canCreateChild: input.permission === DOCUMENT_COLLABORATION_PERMISSION.EDIT
      && input.scope === DOCUMENT_COLLABORATION_SCOPE.DESCENDANTS,
  }
}

export function getWorkspaceDocumentCollaborationCapabilities(input: {
  workspaceType: WorkspaceType
  workspaceMemberRole?: WorkspaceMemberRole | null
}): DocumentCollaborationCapabilities | null {
  if (!input.workspaceMemberRole) {
    return null
  }

  if (input.workspaceType === WORKSPACE_TYPE.PERSONAL) {
    if (input.workspaceMemberRole !== WORKSPACE_MEMBER_ROLE.OWNER) {
      return null
    }

    return createMaintainerCapabilities()
  }

  if (input.workspaceType !== WORKSPACE_TYPE.TEAM) {
    return null
  }

  if (
    input.workspaceMemberRole === WORKSPACE_MEMBER_ROLE.OWNER
    || input.workspaceMemberRole === WORKSPACE_MEMBER_ROLE.ADMIN
  ) {
    return createMaintainerCapabilities()
  }

  return {
    ...DOCUMENT_COLLABORATION_PERMISSION_CAPABILITIES[DOCUMENT_COLLABORATION_PERMISSION.EDIT],
    canCreateChild: true,
  }
}

export function canManageDocumentCollaborators(input: {
  workspaceType: WorkspaceType
  workspaceMemberRole?: WorkspaceMemberRole | null
}): boolean {
  return getWorkspaceDocumentCollaborationCapabilities(input)?.canManageCollaboration ?? false
}

function createMaintainerCapabilities(): DocumentCollaborationCapabilities {
  return {
    canRead: true,
    canEdit: true,
    canCreateChild: true,
    canManageCollaboration: true,
    canPublish: true,
    canMove: true,
    canTrash: true,
    canRestore: true,
  }
}
