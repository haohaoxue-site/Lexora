import type { UserCollabIdentity } from '@haohaoxue/samepage-contracts'

/**
 * 协作身份展示属性。
 */
export interface CollabIdentityItemProps {
  /**
   * 用户身份
   * @description 高风险协作场景统一展示的用户摘要。
   */
  identity: UserCollabIdentity
  /**
   * 头像尺寸
   * @description 数字按像素处理。
   */
  avatarSize?: number | string
}

/**
 * 协作用户查找框属性。
 */
export interface CollabUserLookupFieldProps {
  /**
   * 占位文案
   * @description 引导输入完整 userCode。
   */
  placeholder?: string
  /**
   * 查找按钮文案
   * @description 触发精确查询时展示。
   */
  lookupButtonText?: string
  /**
   * 自己目标提示
   * @description 命中当前用户时的拦截文案。
   */
  selfTargetMessage?: string
  /**
   * 禁用态
   * @description 为 true 时禁止输入和查找。
   */
  disabled?: boolean
}

/**
 * 协作用户查找框事件。
 */
export interface CollabUserLookupFieldEmits {
  resolved: [user: UserCollabIdentity]
  cleared: []
}
