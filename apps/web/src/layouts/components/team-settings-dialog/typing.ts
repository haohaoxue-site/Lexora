import type { TeamWorkspaceSummary } from '@haohaoxue/samepage-contracts'

/**
 * 团队设置弹窗属性。
 */
export interface TeamSettingsDialogProps {
  /**
   * 当前团队空间
   * @description 为空时表示当前不处于团队空间。
   */
  workspace: Readonly<TeamWorkspaceSummary> | null
}
