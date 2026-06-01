import type { AppearancePreference } from '@haohaoxue/samepage-contracts'
import type { SvgIconProps } from '@/components/svg-icon/typing'
import type { SessionNotificationInvitationItem } from '@/layouts/components/session-notification-bell/useSessionNotificationBell'

export interface SessionMenuUser {
  displayName: string
  email: string
  avatarUrl: string | null
  userCode: string
}

export interface SessionAppearanceOption {
  label: string
  value: AppearancePreference
}

export interface SessionAppearancePanelProps {
  currentAppearance: AppearancePreference
  isSaving: boolean
  options: SessionAppearanceOption[]
}

export interface SessionContextSwitchAction {
  label: string
  iconCategory: NonNullable<SvgIconProps['category']>
  icon: string
}

export interface SessionNotificationPanelProps {
  hasLoaded: boolean
  isLoading: boolean
  loadErrorMessage: string
  invitationItems: SessionNotificationInvitationItem[]
  actingInvitationId: string
  actingInvitationAction: 'accept' | 'decline' | null
}
