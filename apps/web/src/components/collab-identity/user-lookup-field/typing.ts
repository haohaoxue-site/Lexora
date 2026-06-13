import type { UserCollabIdentity } from '@haohaoxue/lexora-contracts'

export interface CollabUserLookupFieldProps {
  placeholder?: string
  lookupButtonText?: string
  selfTargetMessage?: string
  disabled?: boolean
}

export interface CollabUserLookupFieldEmits {
  resolved: [user: UserCollabIdentity]
  cleared: []
}
