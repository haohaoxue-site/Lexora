import type {
  DocumentCollaborationCollaborator,
  DocumentCollaborationOverview,
} from '@haohaoxue/samepage-contracts'

export type CollaborationOwner = DocumentCollaborationOverview['owner']

export interface CollaborationAvatarStackProps {
  owner: CollaborationOwner | null
  collaborators: DocumentCollaborationCollaborator[]
  canOpen?: boolean
}

export interface CollaborationAvatarStackEmits {
  open: []
}
