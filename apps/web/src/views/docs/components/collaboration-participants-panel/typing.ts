import type {
  DocumentCollaborationCollaborator,
  DocumentCollaborationOverview,
  DocumentCollaborationScope,
} from '@haohaoxue/samepage-contracts'

export interface CollaborationOption<T extends string> {
  value: T
  label: string
}

export type CollaborationOwner = DocumentCollaborationOverview['owner']

export interface CollaborationOwnerRow {
  type: 'owner'
  id: string
  owner: CollaborationOwner
}

export interface CollaborationCollaboratorRow {
  type: 'collaborator'
  id: string
  collaborator: DocumentCollaborationCollaborator
}

export type CollaborationParticipantRow = CollaborationOwnerRow | CollaborationCollaboratorRow

export interface CollaborationParticipantsPanelProps {
  rows: CollaborationParticipantRow[]
  actionId: string
  scopeOptions: CollaborationOption<DocumentCollaborationScope>[]
}

export interface CollaborationParticipantsPanelEmits {
  permissionCommand: [row: DocumentCollaborationCollaborator, command: string | number | object]
  scopeCommand: [row: DocumentCollaborationCollaborator, command: string | number | object]
}
