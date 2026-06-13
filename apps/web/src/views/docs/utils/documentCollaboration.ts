import type {
  DocumentCollaborationCollaborator,
  DocumentCollaborationPermission,
  DocumentCollaborationScope,
} from '@haohaoxue/samepage-contracts/document/collaboration'
import type {
  UserCollabIdentity,
} from '@haohaoxue/samepage-contracts/user'
import {
  DOCUMENT_COLLABORATION_COLLABORATOR_SOURCE,
  DOCUMENT_COLLABORATION_PERMISSION,
  DOCUMENT_COLLABORATION_SCOPE,
} from '@haohaoxue/samepage-contracts/document/collaboration/constants'
import { translate } from '@/i18n'

export function getCollaborationIdentityName(identity: UserCollabIdentity | { displayName: string, avatarUrl: string | null }) {
  return identity.displayName || ('userCode' in identity ? identity.userCode : translate('docs.collaboration.userFallback'))
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
  return permission === DOCUMENT_COLLABORATION_PERMISSION.EDIT
    ? translate('docs.collaboration.canEdit')
    : translate('docs.collaboration.canRead')
}

export function formatCollaborationScope(scope: DocumentCollaborationScope) {
  return scope === DOCUMENT_COLLABORATION_SCOPE.DESCENDANTS
    ? translate('docs.collaboration.scopeDescendants')
    : translate('docs.collaboration.scopeSelf')
}

export function formatCollaborationSource(row: DocumentCollaborationCollaborator) {
  if (row.source === DOCUMENT_COLLABORATION_COLLABORATOR_SOURCE.DIRECT) {
    return translate('docs.collaboration.directGrant')
  }

  if (row.inheritedFrom?.title) {
    return translate('docs.collaboration.inheritedFromTitle', { title: row.inheritedFrom.title })
  }

  return translate('docs.collaboration.inheritedFromParent')
}
