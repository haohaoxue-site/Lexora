import type { UserCollabIdentity } from '@haohaoxue/samepage-contracts'

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
