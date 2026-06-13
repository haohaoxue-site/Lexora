import type {
  DocumentCollaborationPermission,
  DocumentCollaborationScope,
} from '@haohaoxue/lexora-contracts'

export type CollaborationDialogView = 'overview' | 'collaborators' | 'password'
export type CollaboratorPermissionCommand = 'inherit' | 'read' | 'edit' | 'remove'

export interface DocumentCollaborationDialogProps {
  modelValue: boolean
  documentId?: string | null
}

export interface DocumentCollaborationDialogEmits {
  'update:modelValue': [visible: boolean]
}

export interface InvitationForm {
  userCode: string
  permission: DocumentCollaborationPermission
  scope: DocumentCollaborationScope
}

export interface LinkForm {
  enabled: boolean
  permission: DocumentCollaborationPermission
  scope: DocumentCollaborationScope
}
