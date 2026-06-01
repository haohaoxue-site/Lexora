import type {
  DocumentCollaborationCollaborator,
  DocumentCollaborationPermission,
  DocumentCollaborationScope,
  UserCollabIdentity,
} from '@haohaoxue/samepage-contracts'
import {
  DOCUMENT_COLLABORATION_COLLABORATOR_SOURCE,
  DOCUMENT_COLLABORATION_PERMISSION_LABELS,
  DOCUMENT_COLLABORATION_SCOPE_LABELS,
} from '@haohaoxue/samepage-contracts'

export function getCollaborationIdentityName(identity: UserCollabIdentity | { displayName: string, avatarUrl: string | null }) {
  return identity.displayName || ('userCode' in identity ? identity.userCode : '用户')
}

export function getCollaborationAvatarText(identity: UserCollabIdentity | { displayName: string, avatarUrl: string | null }) {
  return getCollaborationIdentityName(identity).slice(0, 1).toUpperCase()
}

export function formatCollaborationIdentity(identity: UserCollabIdentity) {
  const name = getCollaborationIdentityName(identity)
  const suffix = identity.email || identity.userCode

  return `${name} · ${suffix}`
}

export function formatCollaborationPermission(permission: DocumentCollaborationPermission) {
  return DOCUMENT_COLLABORATION_PERMISSION_LABELS[permission]
}

export function formatCollaborationScope(scope: DocumentCollaborationScope) {
  return DOCUMENT_COLLABORATION_SCOPE_LABELS[scope]
}

export function formatCollaborationSource(row: DocumentCollaborationCollaborator) {
  if (row.source === DOCUMENT_COLLABORATION_COLLABORATOR_SOURCE.DIRECT) {
    return '当前页面授权'
  }

  if (row.inheritedFrom?.title) {
    return `继承自「${row.inheritedFrom.title}」`
  }

  return '继承自父级页面'
}
