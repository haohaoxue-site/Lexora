import type {
  DocumentCollaborationCollaborator,
  DocumentCollaborationOverview,
} from '@haohaoxue/lexora-contracts'

export type CollaborationOwner = DocumentCollaborationOverview['owner']

export interface CollaborationAvatarStackProps {
  owner: CollaborationOwner | null
  collaborators: DocumentCollaborationCollaborator[]
  canOpen?: boolean
}

export interface CollaborationAvatarStackEmits {
  open: []
}
