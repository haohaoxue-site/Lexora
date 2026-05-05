import type {
  DocumentCollaborationRole,
  DocumentShareMode,
  WorkspaceMemberRole,
  WorkspaceType,
} from '@haohaoxue/samepage-contracts'
import {
  DOCUMENT_COLLABORATION_ROLE,
  DOCUMENT_SHARE_MODE,
  WORKSPACE_MEMBER_ROLE,
  WORKSPACE_TYPE,
} from '@haohaoxue/samepage-contracts'

/**
 * 文档协作能力矩阵。
 */
export interface DocumentCollaborationCapabilities {
  /** 是否可读 */
  canRead: boolean
  /** 是否可评论 */
  canComment: boolean
  /** 是否可编辑正文 */
  canWrite: boolean
  /** 是否可管理分享 */
  canManageShare: boolean
  /** 是否可管理协作者 */
  canManageCollaborators: boolean
}

const DOCUMENT_COLLABORATION_CAPABILITIES: Record<DocumentCollaborationRole, DocumentCollaborationCapabilities> = {
  [DOCUMENT_COLLABORATION_ROLE.MAINTAINER]: {
    canRead: true,
    canComment: true,
    canWrite: true,
    canManageShare: true,
    canManageCollaborators: true,
  },
  [DOCUMENT_COLLABORATION_ROLE.EDITOR]: {
    canRead: true,
    canComment: true,
    canWrite: true,
    canManageShare: false,
    canManageCollaborators: false,
  },
  [DOCUMENT_COLLABORATION_ROLE.COMMENTER]: {
    canRead: true,
    canComment: true,
    canWrite: false,
    canManageShare: false,
    canManageCollaborators: false,
  },
}

export function getDocumentCollaborationCapabilities(
  role: DocumentCollaborationRole,
): DocumentCollaborationCapabilities {
  return DOCUMENT_COLLABORATION_CAPABILITIES[role]
}

export function resolveWorkspaceDocumentCollaborationRole(input: {
  workspaceType: WorkspaceType
  workspaceMemberRole?: WorkspaceMemberRole | null
}): DocumentCollaborationRole | null {
  if (!input.workspaceMemberRole) {
    return null
  }

  if (input.workspaceType === WORKSPACE_TYPE.PERSONAL) {
    return input.workspaceMemberRole === WORKSPACE_MEMBER_ROLE.OWNER
      ? DOCUMENT_COLLABORATION_ROLE.MAINTAINER
      : null
  }

  if (input.workspaceType !== WORKSPACE_TYPE.TEAM) {
    return null
  }

  if (
    input.workspaceMemberRole === WORKSPACE_MEMBER_ROLE.OWNER
    || input.workspaceMemberRole === WORKSPACE_MEMBER_ROLE.ADMIN
  ) {
    return DOCUMENT_COLLABORATION_ROLE.MAINTAINER
  }

  return DOCUMENT_COLLABORATION_ROLE.EDITOR
}

export function canManageDocumentShare(input: {
  workspaceType: WorkspaceType
  workspaceMemberRole?: WorkspaceMemberRole | null
}): boolean {
  const role = resolveWorkspaceDocumentCollaborationRole(input)

  if (!role) {
    return false
  }

  return getDocumentCollaborationCapabilities(role).canManageShare
}

export function isDocumentLinkShareMode(
  mode: DocumentShareMode | null | undefined,
): mode is Extract<DocumentShareMode, 'LOGGED_IN' | 'PUBLIC'> {
  return mode === DOCUMENT_SHARE_MODE.LOGGED_IN || mode === DOCUMENT_SHARE_MODE.PUBLIC
}
