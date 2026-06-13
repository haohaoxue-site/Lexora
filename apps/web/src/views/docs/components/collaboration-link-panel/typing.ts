import type {
  DocumentCollaborationOverview,
  DocumentCollaborationPermission,
  DocumentCollaborationScope,
} from '@haohaoxue/lexora-contracts'

export interface CollaborationOption<T extends string> {
  value: T
  label: string
}

export interface CollaborationLinkPanelProps {
  activeLink: DocumentCollaborationOverview['linkInvite']
  accessTitle: string
  accessDescription: string
  passwordLabel: string
  canCopyLink: boolean
  isUpdatingLink: boolean
  permissionOptions: CollaborationOption<DocumentCollaborationPermission>[]
  scopeOptions: CollaborationOption<DocumentCollaborationScope>[]
}

export interface CollaborationLinkPanelEmits {
  linkEnabledCommand: [command: string | number | object]
  saveLink: []
  openPassword: []
  copyLink: []
}
