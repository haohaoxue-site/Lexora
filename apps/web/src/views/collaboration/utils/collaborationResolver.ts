import {
  DOCUMENT_COLLABORATION_PERMISSION,
  DOCUMENT_COLLABORATION_SCOPE,
} from '@haohaoxue/samepage-contracts/document/collaboration/constants'

export function getCollaborationPermissionRank(permission: string) {
  return permission === DOCUMENT_COLLABORATION_PERMISSION.EDIT ? 2 : 1
}

export function getCollaborationScopeRank(scope: string) {
  return scope === DOCUMENT_COLLABORATION_SCOPE.DESCENDANTS ? 2 : 1
}
