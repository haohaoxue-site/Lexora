import type {
  DocumentCollaborationCollaborator,
  DocumentCollaborationOverview,
  DocumentCollaborationPermission,
  DocumentCollaborationScope,
  UserCollabIdentity,
} from '@haohaoxue/samepage-contracts'

export type CollaborationOwner = DocumentCollaborationOverview['owner']

export interface CollaborationOption<T extends string> {
  value: T
  label: string
}

export interface CollaborationInvitePanelProps {
  owner: CollaborationOwner | null
  collaborators: DocumentCollaborationCollaborator[]
  canOpenCollaborators: boolean
  resolvedInvitee: UserCollabIdentity | null
  resolvedCollaborator: DocumentCollaborationCollaborator | null
  hasResolvedInvitation: boolean
  isResolvedOwner: boolean
  inviteeResolveError: string
  isResolvingInvitee: boolean
  isCreatingInvitation: boolean
  canSubmitInvitation: boolean
  invitationSubmitLabel: string
  permissionOptions: CollaborationOption<DocumentCollaborationPermission>[]
  scopeOptions: CollaborationOption<DocumentCollaborationScope>[]
}

export interface CollaborationInvitePanelEmits {
  openCollaborators: []
  submit: []
}
