import type { DocumentRecent } from '@haohaoxue/samepage-contracts'
import type { SvgIconCategory } from '@/components/svg-icon/typing'

export type HomeWidgetId = 'welcome' | 'recent-documents' | 'schedule'

export interface HomeWidgetDefinition {
  /**
   * 标识
   * @description 首页模块稳定 ID。
   */
  id: HomeWidgetId
  /**
   * 标题
   * @description 模块名称。
   */
  title: string
  /**
   * 描述
   * @description 模块用途说明。
   */
  description: string
}

export interface HomeQuickActionItem {
  /**
   * 标识
   * @description 操作稳定 ID。
   */
  id: string
  /**
   * 标题
   * @description 操作名称。
   */
  title: string
  /**
   * 描述
   * @description 操作辅助说明。
   */
  description: string
  /**
   * 图标分类
   * @description 快捷操作图标所在的 sprite 分类。
   */
  iconCategory: SvgIconCategory
  /**
   * 图标
   * @description SVG symbol 名称。
   */
  icon: string
  /**
   * 路径
   * @description 点击后跳转的目标路径。
   */
  to: string
}

export interface HomeActivityItem {
  /**
   * 标识
   * @description 活动稳定 ID。
   */
  id: string
  /**
   * 标题
   * @description 活动主文案。
   */
  title: string
  /**
   * 描述
   * @description 活动详情。
   */
  description: string
  /**
   * 时间
   * @description 活动展示时间。
   */
  timeLabel: string
}

export interface HomeScheduleItem {
  /**
   * 标识
   * @description 日程稳定 ID。
   */
  id: string
  /**
   * 时间
   * @description 日程时间标签。
   */
  timeLabel: string
  /**
   * 标题
   * @description 日程主题。
   */
  title: string
  /**
   * 描述
   * @description 日程补充说明。
   */
  description: string
}

export type HomeRecentDocument = DocumentRecent

export interface HomeOverviewModel {
  eyebrow: string
  title: string
  description: string
  dateLabel: string
}

export interface HomeWelcomePanelProps {
  overview: HomeOverviewModel
}

export interface HomeQuickActionsPanelProps {
  actions: HomeQuickActionItem[]
}

export interface HomeRecentActivityPanelProps {
  activities: HomeActivityItem[]
}

export interface HomeSchedulePanelProps {
  schedules: HomeScheduleItem[]
}

export interface HomeWidgetSettingsPopoverProps {
  widgets: HomeWidgetDefinition[]
  visibleWidgetSet: Set<HomeWidgetId>
}

export interface HomeWidgetSettingsPopoverEmits {
  toggle: [widgetId: HomeWidgetId]
}

export interface RecentDocumentListProps {
  documents: HomeRecentDocument[]
}
