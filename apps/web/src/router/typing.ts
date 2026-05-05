import type { SvgIconCategory } from '@/components/svg-icon/typing'

/**
 * 工作区侧栏导航元数据。
 */
export interface WorkspaceNavigationMeta {
  /**
   * 标题
   * @description 侧栏主文案。
   */
  label: string
  /**
   * 图标分类
   * @description 对应的 sprite 分类。
   */
  iconCategory: SvgIconCategory
  /**
   * 图标
   * @description 默认态 SVG symbol 名称。
   */
  icon: string
  /**
   * 激活图标
   * @description 命中当前路由时使用的 SVG symbol 名称。
   */
  activeIcon?: string
}

/**
 * 工作区侧栏导航项。
 */
export interface WorkspaceNavigationItem extends WorkspaceNavigationMeta {
  /**
   * 标识
   * @description 对应路由的稳定 ID。
   */
  id: string
  /**
   * 路径
   * @description 侧栏点击后的目标路径。
   */
  to: string
}

/**
 * 系统后台路由名。
 */
export type AdminRouteName
  = | 'admin-overview'
    | 'admin-users'
    | 'admin-email'
    | 'admin-model-providers'
    | 'admin-audit'

/**
 * 系统后台导航项。
 */
export interface AdminNavigationItem {
  /**
   * 标题
   * @description 导航中展示的名称。
   */
  label: string
  /**
   * 图标
   * @description 后台侧栏展示的 symbol 名称。
   */
  icon: string
  /**
   * 页面标题
   * @description 当前后台页面头部展示标题。
   */
  title: string
  /**
   * 路由名
   * @description 点击后跳转的目标路由。
   */
  routeName: AdminRouteName
  /**
   * 路径
   * @description 导航跳转目标路径。
   */
  path: string
}
