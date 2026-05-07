import type {
  AuthProviderName,
  DeleteCurrentUserRequest,
  UserSettings,
} from '@haohaoxue/samepage-contracts'

export interface UserProfileSectionProps {
  avatarUrl: string | null
  userCode: string
  canEditDisplayName: boolean
  isSavingDisplayName: boolean
  isUploading: boolean
}

export interface UserProfileSectionEmits {
  saveDisplayName: []
  upload: [file: File]
}

export interface UserAccountSectionProps {
  account: UserSettings['account']
  emailBindingEnabled: boolean
  isSendingCode: boolean
  isBindingEmail: boolean
  bindingProvider: AuthProviderName | null
  disconnectingProvider: AuthProviderName | null
  canDisconnectGithub: boolean
  canDisconnectLinuxDo: boolean
  canStartGithubBinding: boolean
  canStartLinuxDoBinding: boolean
}

export interface UserAccountSectionEmits {
  sendCode: []
  confirmEmail: []
  startOauthBinding: [provider: AuthProviderName]
  disconnectOauthBinding: [provider: AuthProviderName]
}

export interface UserSettingsSectionHeaderProps {
  title: string
  description?: string
}

export interface UserPreferenceSectionProps {
  isSavingLanguage: boolean
  isSavingAppearance: boolean
}

export interface UserDeleteSectionProps {
  isDeleting: boolean
  confirmationTarget: string
  confirmationMode: 'email' | 'displayName'
  confirmationPhrase: DeleteCurrentUserRequest['confirmationPhrase']
}

export interface UserDeleteSectionEmits {
  deleteAccount: [payload: DeleteCurrentUserRequest]
}
