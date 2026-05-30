import type { AppearancePreference } from '@haohaoxue/samepage-contracts'
import type { SvgIconProps } from '@/components/svg-icon/typing'

/**
 * 会话菜单中的用户摘要。
 */
export interface SessionMenuUser {
  displayName: string
  email: string
  avatarUrl: string | null
}

/**
 * 外观选项。
 */
export interface SessionAppearanceOption {
  label: string
  value: AppearancePreference
}

/**
 * 外观子面板参数。
 */
export interface SessionAppearancePanelProps {
  currentAppearance: AppearancePreference
  isSaving: boolean
  options: SessionAppearanceOption[]
}

/**
 * 上下文切换动作。
 */
export interface SessionContextSwitchAction {
  label: string
  iconCategory: NonNullable<SvgIconProps['category']>
  icon: string
}
