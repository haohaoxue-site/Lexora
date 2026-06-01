import type {
  AiModelIntentKey,
  AuthProviderName,
  DeleteCurrentUserRequest,
  UserSettings,
} from '@haohaoxue/samepage-contracts'

export type SettingsTabName = 'user' | 'preference' | 'providers' | 'models-default'

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
  oauthProviderBindingState: Record<AuthProviderName, {
    canDisconnect: boolean
    canStartBinding: boolean
  }>
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

/**
 * 默认模型场景选项。
 */
export interface SettingsModelIntentOption {
  /** 场景键 */
  key: AiModelIntentKey
  /** 展示名称 */
  label: string
  /** 场景说明 */
  description: string
  /** 父级默认模型场景 */
  parentKey?: AiModelIntentKey
}

/**
 * 默认模型大类。
 */
export interface SettingsModelIntentGroup {
  /** 大类键 */
  key: AiModelIntentKey
  /** 大类名称 */
  label: string
  /** 大类说明 */
  description: string
  /** 子场景配置项 */
  children: SettingsModelIntentOption[]
}
